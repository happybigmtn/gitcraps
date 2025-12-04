use ore_api::prelude::*;
use solana_program::log::sol_log;
use steel::*;

/// Result of session validation.
pub struct SessionValidation {
    /// The actual authority (user) who owns the account.
    pub authority: Pubkey,
    /// Whether the signer is using a session key (delegate).
    pub is_delegate: bool,
}

/// Validates that a signer is authorized to act on behalf of an authority.
///
/// This function checks:
/// 1. If signer == authority, returns Ok (direct authorization)
/// 2. If signer != authority, checks for a valid session where signer == delegate
///
/// Arguments:
/// - `signer`: The account that signed the transaction
/// - `authority`: The account that owns the resource being accessed
/// - `session_info`: Optional session account info (can be None if not provided)
/// - `required_op`: The operation type that must be allowed
///
/// Returns:
/// - Ok(SessionValidation) if authorized
/// - Err(ProgramError) if not authorized
pub fn validate_session_or_authority(
    signer: &AccountInfo<'_>,
    authority: &Pubkey,
    session_info: Option<&AccountInfo<'_>>,
    required_op: SessionOperation,
) -> Result<SessionValidation, ProgramError> {
    // Case 1: Direct authorization - signer is the authority.
    if signer.key == authority {
        return Ok(SessionValidation {
            authority: *authority,
            is_delegate: false,
        });
    }

    // Case 2: Delegate authorization via session.
    let session_info = session_info.ok_or_else(|| {
        sol_log("Session required for delegate authorization");
        ProgramError::MissingRequiredSignature
    })?;

    // Verify session PDA.
    let (expected_session, _) = session_pda(*authority);
    if session_info.key != &expected_session {
        sol_log("Invalid session PDA");
        return Err(ProgramError::InvalidSeeds);
    }

    // Load and validate session.
    let session = session_info.as_account::<Session>(&ore_api::ID)?;

    // Verify the session belongs to the authority.
    if session.authority != *authority {
        sol_log("Session authority mismatch");
        return Err(ProgramError::IllegalOwner);
    }

    // Verify the signer is the delegate.
    if session.delegate != *signer.key {
        sol_log("Signer is not the session delegate");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify the signer actually signed.
    if !signer.is_signer {
        sol_log("Delegate must be signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify session is not expired.
    let clock = Clock::get()?;
    if !session.is_valid(clock.unix_timestamp) {
        sol_log("Session expired");
        return Err(ProgramError::AccountNotRentExempt); // Re-using for "expired"
    }

    // Verify the required operation is allowed.
    if !session.allows_operation(required_op) {
        sol_log("Operation not allowed by session");
        return Err(ProgramError::InvalidArgument);
    }

    Ok(SessionValidation {
        authority: *authority,
        is_delegate: true,
    })
}

/// Simpler validation that just checks if signer can act as authority.
/// Does not require session info - will fail if signer != authority.
pub fn require_authority(signer: &AccountInfo<'_>, authority: &Pubkey) -> ProgramResult {
    signer.is_signer()?;
    if signer.key != authority {
        sol_log("Signer must be authority");
        return Err(ProgramError::IllegalOwner);
    }
    Ok(())
}

/// Check if an AccountInfo could be a session account (by checking PDA).
pub fn is_potential_session(account: &AccountInfo<'_>, authority: &Pubkey) -> bool {
    let (expected, _) = session_pda(*authority);
    account.key == &expected && !account.data_is_empty()
}

// ============================================================================
// USAGE PATTERN FOR INSTRUCTIONS
// ============================================================================
//
// To add session key support to an existing instruction:
//
// 1. Add an optional session account at the end of the account list:
//    ```
//    /// Account layout:
//    /// 0: signer (delegate OR authority)
//    /// 1: authority (the user who owns the resources)
//    /// ... other accounts ...
//    /// N: [optional] session (PDA, if signer != authority)
//    ```
//
// 2. Modify the account loading to check for session:
//    ```rust
//    // Check if signer is authority or delegate with valid session
//    let session_info = accounts.get(N); // Optional session account
//    validate_session_or_authority(
//        signer_info,
//        authority_info.key,
//        session_info,
//        SessionOperation::Games, // or Swaps, StakingDeposit, Mining
//    )?;
//    ```
//
// 3. For token transfers from user, use authority as the source but
//    allow delegate to sign:
//    - If using session: The frontend must build an "approve" instruction
//      first so delegate can transfer on behalf of authority
//    - Or: Authority pre-deposits tokens to a program-controlled vault
//
// IMPORTANT: Withdrawals (Withdraw, ClaimWinnings, etc.) should NEVER
// accept session delegation - always require direct authority signature.
//

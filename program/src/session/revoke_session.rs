use ore_api::prelude::*;
use solana_program::log::sol_log;
use steel::*;

/// Revokes an existing session before it expires.
/// Only the authority (user) can revoke their session.
/// This closes the account and returns rent to the payer.
///
/// Accounts:
/// 0. `[signer]` Authority - The user revoking the session
/// 1. `[writable]` Session - The session PDA to be closed
/// 2. `[writable]` Payer - Account to receive rent refund
pub fn process_revoke_session(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    // Load accounts.
    let [authority_info, session_info, payer_info] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    authority_info.is_signer()?;
    session_info.is_writable()?;
    payer_info.is_writable()?;

    // Verify session PDA derivation.
    let (expected_session, _) = session_pda(*authority_info.key);
    if session_info.key != &expected_session {
        sol_log("Invalid session PDA");
        return Err(ProgramError::InvalidSeeds);
    }

    // Load and verify session.
    let session = session_info.as_account::<Session>(&ore_api::ID)?;
    if session.authority != *authority_info.key {
        sol_log("Only authority can revoke session");
        return Err(ProgramError::IllegalOwner);
    }

    // Close the session account - transfer lamports back to payer.
    let lamports = session_info.lamports();
    **session_info.try_borrow_mut_lamports()? = 0;
    **payer_info.try_borrow_mut_lamports()? = payer_info
        .lamports()
        .checked_add(lamports)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Clear the account data.
    session_info.assign(&system_program::ID);
    session_info.realloc(0, true)?;

    sol_log("Session revoked");

    Ok(())
}

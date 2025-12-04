use ore_api::prelude::*;
use solana_program::log::sol_log;
use steel::*;

/// Maximum session duration: 24 hours in seconds.
pub const MAX_SESSION_DURATION: i64 = 24 * 60 * 60;

/// Creates a session that allows a delegate key to sign on behalf of the user.
/// The delegate can perform all operations EXCEPT withdrawals.
///
/// Accounts:
/// 0. `[signer]` Authority - The user creating the session
/// 1. `[signer]` Payer - The account paying for rent
/// 2. `[writable]` Session - The session PDA to be created
/// 3. `[]` System Program
pub fn process_create_session(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = CreateSession::try_from_bytes(data)?;
    let delegate = Pubkey::new_from_array(args.delegate);
    let duration = i64::from_le_bytes(args.duration);
    let allowed_operations = u64::from_le_bytes(args.allowed_operations);

    // Validate duration (max 24 hours).
    if duration <= 0 || duration > MAX_SESSION_DURATION {
        sol_log("Invalid session duration (max 24 hours)");
        return Err(ProgramError::InvalidArgument);
    }

    // If allowed_operations is 0, enable all non-withdrawal ops.
    let allowed_ops = if allowed_operations == 0 {
        Session::all_operations()
    } else {
        allowed_operations
    };

    // Load accounts.
    let clock = Clock::get()?;
    let [authority_info, payer_info, session_info, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    authority_info.is_signer()?;
    payer_info.is_signer()?;
    session_info.is_writable()?;
    system_program.is_program(&system_program::ID)?;

    // Verify session PDA derivation.
    let (expected_session, _) = session_pda(*authority_info.key);
    if session_info.key != &expected_session {
        sol_log("Invalid session PDA");
        return Err(ProgramError::InvalidSeeds);
    }

    // Create or update session account.
    if session_info.data_is_empty() {
        // Create new session account.
        create_program_account::<Session>(
            session_info,
            system_program,
            payer_info,
            &ore_api::ID,
            &[SESSION, &authority_info.key.to_bytes()],
        )?;

        let session = session_info.as_account_mut::<Session>(&ore_api::ID)?;
        session.authority = *authority_info.key;
        session.delegate = delegate;
        session.created_at = clock.unix_timestamp;
        session.expires_at = clock.unix_timestamp + duration;
        session.allowed_operations = allowed_ops;
        session._reserved = [0u8; 32];

        sol_log(&format!(
            "Session created: delegate={}, expires_at={}, ops={}",
            delegate, session.expires_at, allowed_ops
        ));
    } else {
        // Update existing session (must be the authority).
        let session = session_info
            .as_account_mut::<Session>(&ore_api::ID)?
            .assert_mut(|s| s.authority == *authority_info.key)?;

        session.delegate = delegate;
        session.created_at = clock.unix_timestamp;
        session.expires_at = clock.unix_timestamp + duration;
        session.allowed_operations = allowed_ops;

        sol_log(&format!(
            "Session updated: delegate={}, expires_at={}, ops={}",
            delegate, session.expires_at, allowed_ops
        ));
    }

    Ok(())
}

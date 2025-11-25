use ore_api::consts::BOARD_SIZE;
use ore_api::prelude::*;
use solana_program::log::sol_log;
use steel::*;

/// Initialize the program accounts (Board, Config, Treasury, Round 0).
/// Can only be called once by the program deployer.
pub fn process_initialize(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    // Load accounts
    let [signer_info, board_info, config_info, treasury_info, round_info, system_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    board_info
        .is_empty()?
        .is_writable()?
        .has_seeds(&[BOARD], &ore_api::ID)?;
    config_info
        .is_empty()?
        .is_writable()?
        .has_seeds(&[CONFIG], &ore_api::ID)?;
    treasury_info
        .is_empty()?
        .is_writable()?
        .has_seeds(&[TREASURY], &ore_api::ID)?;
    round_info
        .is_empty()?
        .is_writable()?
        .has_seeds(&[ROUND, &0u64.to_le_bytes()], &ore_api::ID)?;
    system_program.is_program(&system_program::ID)?;

    sol_log("Initializing OreCraps program accounts...");

    // Get current slot
    let clock = Clock::get()?;

    // Create Board account
    create_program_account::<Board>(
        board_info,
        system_program,
        signer_info,
        &ore_api::ID,
        &[BOARD],
    )?;
    let board = board_info.as_account_mut::<Board>(&ore_api::ID)?;
    board.round_id = 0;
    // Pre-start the round for devnet testing (bypasses entropy requirement)
    board.start_slot = clock.slot;
    board.end_slot = clock.slot + 3000; // ~20 minutes at 400ms/slot
    sol_log(&format!("Board created at {}", board_info.key));

    // Create Config account
    create_program_account::<Config>(
        config_info,
        system_program,
        signer_info,
        &ore_api::ID,
        &[CONFIG],
    )?;
    let config = config_info.as_account_mut::<Config>(&ore_api::ID)?;
    config.admin = *signer_info.key;
    config.bury_authority = *signer_info.key;
    config.fee_collector = *signer_info.key;
    config.swap_program = Pubkey::default();
    config.var_address = Pubkey::default();
    config.admin_fee = 100; // 1% (100 bps)
    sol_log(&format!("Config created at {}", config_info.key));

    // Create Treasury account
    create_program_account::<Treasury>(
        treasury_info,
        system_program,
        signer_info,
        &ore_api::ID,
        &[TREASURY],
    )?;
    let treasury = treasury_info.as_account_mut::<Treasury>(&ore_api::ID)?;
    treasury.balance = 0;
    treasury.motherlode = 0;
    treasury.miner_rewards_factor = Numeric::ZERO;
    treasury.stake_rewards_factor = Numeric::ZERO;
    treasury.total_staked = 0;
    treasury.total_unclaimed = 0;
    treasury.total_refined = 0;
    sol_log(&format!("Treasury created at {}", treasury_info.key));

    // Create Round 0 account
    create_program_account::<Round>(
        round_info,
        system_program,
        signer_info,
        &ore_api::ID,
        &[ROUND, &0u64.to_le_bytes()],
    )?;
    let round = round_info.as_account_mut::<Round>(&ore_api::ID)?;
    round.id = 0;
    round.deployed = [0; BOARD_SIZE];
    round.slot_hash = [0; 32];
    round.count = [0; BOARD_SIZE];
    round.expires_at = board.end_slot + 150; // Claims expire shortly after round ends
    round.motherlode = 0;
    round.rent_payer = *signer_info.key;
    round.top_miner = Pubkey::default();
    round.top_miner_reward = 0;
    round.total_deployed = 0;
    round.total_vaulted = 0;
    round.total_winnings = 0;
    sol_log(&format!("Round 0 created at {}", round_info.key));

    sol_log("OreCraps program initialized successfully!");

    Ok(())
}

use ore_api::prelude::*;
use solana_program::log::sol_log;
use steel::*;

/// Funds the craps house bankroll.
/// This can be called by anyone to add SOL to the house bankroll.
pub fn process_fund_craps_house(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = FundCrapsHouse::try_from_bytes(data)?;
    let amount = u64::from_le_bytes(args.amount);

    sol_log(&format!("FundCrapsHouse: amount={}", amount).as_str());

    // Load accounts.
    let [signer_info, craps_game_info, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    craps_game_info
        .is_writable()?
        .has_seeds(&[CRAPS_GAME], &ore_api::ID)?;
    system_program.is_program(&system_program::ID)?;

    // Validate amount.
    if amount == 0 {
        sol_log("Amount must be greater than 0");
        return Err(ProgramError::InvalidArgument);
    }

    // Load or create craps game.
    let craps_game = if craps_game_info.data_is_empty() {
        // Initialize craps game if it doesn't exist.
        create_program_account::<CrapsGame>(
            craps_game_info,
            system_program,
            signer_info,
            &ore_api::ID,
            &[CRAPS_GAME],
        )?;
        let craps_game = craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?;
        craps_game.epoch_id = 1;
        craps_game.point = 0;
        craps_game.is_come_out = 1; // Start in come-out phase
        craps_game.epoch_start_round = 0;
        craps_game.house_bankroll = 0;
        craps_game.total_payouts = 0;
        craps_game.total_collected = 0;
        craps_game
    } else {
        craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?
    };

    // Transfer SOL from signer to craps game.
    craps_game_info.collect(amount, &signer_info)?;

    // Update house bankroll.
    craps_game.house_bankroll += amount;

    sol_log(&format!("House bankroll is now: {}", craps_game.house_bankroll).as_str());

    Ok(())
}

use ore_api::prelude::*;
use solana_program::log::sol_log;
use solana_program::program::invoke;
use steel::*;

/// Funds the craps house bankroll.
/// This can be called by anyone to add CRAP tokens to the house bankroll.
pub fn process_fund_craps_house(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = FundCrapsHouse::try_from_bytes(data)?;
    let amount = u64::from_le_bytes(args.amount);

    sol_log(&format!("FundCrapsHouse: amount={}", amount).as_str());

    // Load accounts.
    // Account layout:
    // 0: signer
    // 1: craps_game - game state PDA
    // 2: craps_vault - vault PDA (owner of vault token account)
    // 3: signer_crap_ata - signer's CRAP token account
    // 4: vault_crap_ata - craps vault's CRAP token account
    // 5: crap_mint - CRAP token mint
    // 6: system_program
    // 7: token_program
    // 8: associated_token_program
    let [signer_info, craps_game_info, craps_vault_info, signer_crap_ata, vault_crap_ata, crap_mint, system_program, token_program, associated_token_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    craps_game_info
        .is_writable()?
        .has_seeds(&[CRAPS_GAME], &ore_api::ID)?;
    craps_vault_info.has_seeds(&[CRAPS_VAULT], &ore_api::ID)?;
    signer_crap_ata.is_writable()?;
    vault_crap_ata.is_writable()?;
    crap_mint.has_address(&CRAP_MINT_ADDRESS)?;
    system_program.is_program(&system_program::ID)?;
    token_program.is_program(&spl_token::ID)?;
    associated_token_program.is_program(&spl_associated_token_account::ID)?;

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

    // Create vault's CRAP token account if it doesn't exist.
    if vault_crap_ata.data_is_empty() {
        create_associated_token_account(
            signer_info,
            craps_vault_info,
            vault_crap_ata,
            crap_mint,
            system_program,
            token_program,
            associated_token_program,
        )?;
        sol_log("Created craps vault CRAP token account");
    }

    // Transfer CRAP tokens from signer to craps vault.
    invoke(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            signer_crap_ata.key,
            vault_crap_ata.key,
            signer_info.key,
            &[],
            amount,
        )?,
        &[
            signer_crap_ata.clone(),
            vault_crap_ata.clone(),
            signer_info.clone(),
            token_program.clone(),
        ],
    )?;

    // Update house bankroll.
    craps_game.house_bankroll = craps_game.house_bankroll
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!("House bankroll is now: {} CRAP tokens", craps_game.house_bankroll).as_str());

    Ok(())
}

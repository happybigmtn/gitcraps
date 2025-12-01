use ore_api::prelude::*;
use solana_program::log::sol_log;
use solana_program::program::invoke_signed;
use steel::*;

/// Claims pending craps winnings for a user.
/// Winnings are paid out in CRAP tokens from the craps vault.
pub fn process_claim_craps_winnings(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    sol_log("ClaimCrapsWinnings");

    // Load accounts.
    // Account layout:
    // 0: signer
    // 1: craps_game - game state PDA
    // 2: craps_position - user position PDA
    // 3: craps_vault - vault PDA (authority for vault token account)
    // 4: vault_crap_ata - craps vault's CRAP token account
    // 5: signer_crap_ata - signer's CRAP token account
    // 6: crap_mint - CRAP token mint
    // 7: token_program
    let [signer_info, craps_game_info, craps_position_info, craps_vault_info, vault_crap_ata, signer_crap_ata, crap_mint, token_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    craps_game_info
        .is_writable()?
        .has_seeds(&[CRAPS_GAME], &ore_api::ID)?;
    craps_position_info
        .is_writable()?
        .has_seeds(&[CRAPS_POSITION, &signer_info.key.to_bytes()], &ore_api::ID)?;
    craps_vault_info.has_seeds(&[CRAPS_VAULT], &ore_api::ID)?;
    vault_crap_ata.is_writable()?;
    signer_crap_ata.is_writable()?;
    crap_mint.has_address(&CRAP_MINT_ADDRESS)?;
    token_program.is_program(&spl_token::ID)?;

    // Get the vault PDA bump for signing
    let (_, craps_vault_bump) = ore_api::state::craps_vault_pda();

    // Load accounts.
    if craps_game_info.data_is_empty() {
        sol_log("Craps game not initialized");
        return Err(ProgramError::UninitializedAccount);
    }
    if craps_position_info.data_is_empty() {
        sol_log("Craps position not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Verify account ownership
    if craps_game_info.owner != &ore_api::ID {
        sol_log("CrapsGame account not owned by program");
        return Err(ProgramError::IncorrectProgramId);
    }
    if craps_position_info.owner != &ore_api::ID {
        sol_log("CrapsPosition account not owned by program");
        return Err(ProgramError::IncorrectProgramId);
    }

    let craps_game = craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?;
    let craps_position = craps_position_info.as_account_mut::<CrapsPosition>(&ore_api::ID)?;

    // Check authority.
    if craps_position.authority != *signer_info.key {
        sol_log("Not the position authority");
        return Err(ProgramError::IllegalOwner);
    }

    // Get pending winnings.
    let amount = craps_position.pending_winnings;
    if amount == 0 {
        sol_log("No pending winnings to claim");
        return Err(ProgramError::InvalidArgument);
    }

    // Verify house bankroll has enough for the payout.
    if craps_game.house_bankroll < amount {
        sol_log("Insufficient house bankroll for payout");
        return Err(ProgramError::InsufficientFunds);
    }

    sol_log(&format!("Claiming {} CRAP tokens from craps vault", amount).as_str());

    // Clear pending winnings BEFORE transfer (Check-Effects-Interactions pattern).
    craps_position.pending_winnings = 0;

    // Update house bankroll.
    craps_game.house_bankroll = craps_game.house_bankroll
        .checked_sub(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Update total payouts.
    craps_game.total_payouts = craps_game.total_payouts
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Transfer CRAP tokens from vault to signer using invoke_signed.
    // The vault PDA is the authority for the vault token account.
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            vault_crap_ata.key,
            signer_crap_ata.key,
            craps_vault_info.key,
            &[],
            amount,
        )?,
        &[
            vault_crap_ata.clone(),
            signer_crap_ata.clone(),
            craps_vault_info.clone(),
            token_program.clone(),
        ],
        &[&[CRAPS_VAULT, &[craps_vault_bump]]],
    )?;

    sol_log(&format!("Claimed {} CRAP tokens", amount).as_str());

    Ok(())
}

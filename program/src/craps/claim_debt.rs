//! SECURITY FIX 2.2: Claim unpaid debt instruction
//!
//! This instruction allows users to claim debt owed to them from previous
//! insolvency events. When the house was unable to pay winnings, the unpaid
//! amount was recorded as debt. Users can claim this debt once the house
//! has been re-funded.

use ore_api::prelude::*;
use solana_program::log::sol_log;
use solana_program::program::invoke_signed;
use steel::*;

/// Claim unpaid debt from previous house insolvency.
pub fn process_claim_craps_debt(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    sol_log("ClaimCrapsDebt: claiming unpaid debt");

    // Load accounts.
    // Account layout:
    // 0: signer (position owner)
    // 1: craps_game - game state PDA
    // 2: craps_position - user position PDA
    // 3: craps_vault - vault PDA
    // 4: signer_crap_ata - signer's CRAP token account
    // 5: vault_crap_ata - craps vault's CRAP token account
    // 6: token_program
    let [signer_info, craps_game_info, craps_position_info, craps_vault_info, signer_crap_ata, vault_crap_ata, token_program] = accounts else {
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
    signer_crap_ata.is_writable()?;
    vault_crap_ata.is_writable()?;
    token_program.is_program(&spl_token::ID)?;

    // Verify account ownership
    if craps_game_info.owner != &ore_api::ID {
        sol_log("CrapsGame account not owned by program");
        return Err(ProgramError::IncorrectProgramId);
    }
    if craps_position_info.owner != &ore_api::ID {
        sol_log("CrapsPosition account not owned by program");
        return Err(ProgramError::IncorrectProgramId);
    }

    if craps_game_info.data_is_empty() || craps_position_info.data_is_empty() {
        sol_log("Accounts not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    let craps_game = craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?;
    let craps_position = craps_position_info.as_account_mut::<CrapsPosition>(&ore_api::ID)?;

    // Verify signer is the position authority
    if craps_position.authority != *signer_info.key {
        sol_log("Signer is not the position authority");
        return Err(ProgramError::IllegalOwner);
    }

    // Check if there's any debt to claim
    if craps_position.unpaid_debt == 0 {
        sol_log("No unpaid debt to claim");
        return Ok(());
    }

    let debt_amount = craps_position.unpaid_debt;

    // Check if house has sufficient funds to pay the debt
    let claimable_amount = if craps_game.house_bankroll >= debt_amount {
        debt_amount
    } else {
        // Partial payment - pay what's available
        craps_game.house_bankroll
    };

    if claimable_amount == 0 {
        sol_log("House bankroll is empty - debt cannot be paid yet");
        return Ok(());
    }

    // Transfer tokens from vault to user
    let vault_bump = Pubkey::find_program_address(&[CRAPS_VAULT], &ore_api::ID).1;
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            vault_crap_ata.key,
            signer_crap_ata.key,
            craps_vault_info.key,
            &[],
            claimable_amount,
        )?,
        &[
            vault_crap_ata.clone(),
            signer_crap_ata.clone(),
            craps_vault_info.clone(),
            token_program.clone(),
        ],
        &[&[CRAPS_VAULT, &[vault_bump]]],
    )?;

    // Update state
    craps_game.house_bankroll = craps_game.house_bankroll
        .checked_sub(claimable_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    craps_position.unpaid_debt = craps_position.unpaid_debt
        .checked_sub(claimable_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Track the payout
    craps_game.total_payouts = craps_game.total_payouts
        .checked_add(claimable_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!(
        "Debt claimed: paid={}, remaining_debt={}",
        claimable_amount, craps_position.unpaid_debt
    ).as_str());

    Ok(())
}

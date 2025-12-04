use ore_api::prelude::*;
use solana_program::log::sol_log;
use spl_token::amount_to_ui_amount;
use steel::*;

/// Claims RNG yield from exchange fees.
///
/// Stakers call this to claim their proportional share of RNG rewards
/// from AMM protocol fees.
///
/// Account layout:
/// 0: signer (staker authority)
/// 1: rng_mint - RNG token mint
/// 2: recipient - staker's RNG token account (destination)
/// 3: stake - staker's stake account (PDA)
/// 4: treasury - treasury account (PDA)
/// 5: treasury_rng_ata - treasury's RNG token account (source)
/// 6: system_program
/// 7: token_program
/// 8: associated_token_program
pub fn process_claim_rng_yield(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    sol_log("ClaimRngYield");

    // Parse data.
    let args = ClaimRngYield::try_from_bytes(data)?;
    let requested_amount = u64::from_le_bytes(args.amount);

    // Load accounts.
    let clock = Clock::get()?;
    let [signer_info, rng_mint_info, recipient_info, stake_info, treasury_info, treasury_rng_ata, system_program, token_program, associated_token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    signer_info.is_signer()?;
    rng_mint_info.has_address(&RNG_MINT_ADDRESS)?.as_mint()?;
    recipient_info.is_writable()?;
    stake_info.is_writable()?;
    treasury_info
        .is_writable()?
        .has_seeds(&[TREASURY], &ore_api::ID)?;
    treasury_rng_ata
        .is_writable()?
        .as_associated_token_account(treasury_info.key, rng_mint_info.key)?;
    system_program.is_program(&system_program::ID)?;
    token_program.is_program(&spl_token::ID)?;
    associated_token_program.is_program(&spl_associated_token_account::ID)?;

    // Load stake account and verify authority.
    let stake = stake_info
        .as_account_mut::<Stake>(&ore_api::ID)?
        .assert_mut(|s| s.authority == *signer_info.key)?;

    // Load treasury.
    let treasury = treasury_info.as_account_mut::<Treasury>(&ore_api::ID)?;

    // Create recipient token account if it doesn't exist.
    if recipient_info.data_is_empty() {
        create_associated_token_account(
            signer_info,
            signer_info,
            recipient_info,
            rng_mint_info,
            system_program,
            token_program,
            associated_token_program,
        )?;
    } else {
        recipient_info.as_associated_token_account(signer_info.key, rng_mint_info.key)?;
    }

    // Calculate claimable amount.
    // If requested_amount is 0, claim all available.
    let amount = if requested_amount == 0 {
        stake.claim_rng(u64::MAX, &clock, treasury)
    } else {
        stake.claim_rng(requested_amount, &clock, treasury)
    };

    if amount == 0 {
        sol_log("No RNG rewards to claim");
        return Ok(());
    }

    // Transfer RNG from treasury to recipient.
    transfer_signed(
        treasury_info,
        treasury_rng_ata,
        recipient_info,
        token_program,
        amount,
        &[TREASURY],
    )?;

    // Update treasury pool.
    treasury.rng_rewards_pool = treasury.rng_rewards_pool.saturating_sub(amount);

    // Log claim.
    sol_log(
        &format!(
            "Claimed {} RNG from exchange fees",
            amount_to_ui_amount(amount, TOKEN_DECIMALS)
        )
        .as_str(),
    );

    Ok(())
}

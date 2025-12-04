use ore_api::prelude::*;
use solana_program::log::sol_log;
use solana_program::program::invoke;
use solana_program::program::invoke_signed;
use steel::*;

/// Game token types for RNG <-> Game Token swaps.
/// Maps to instruction data game_token_type field.
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GameTokenType {
    Crap = 0,   // Craps
    Carat = 1,  // Baccarat
    Bj = 2,     // Blackjack
    Roul = 3,   // Roulette
    War = 4,    // Casino War
    Sico = 5,   // Sic Bo
    Tcp = 6,    // Three Card Poker
    Vpk = 7,    // Video Poker
    Uth = 8,    // Ultimate Texas Hold'em
}

impl TryFrom<u8> for GameTokenType {
    type Error = ProgramError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(GameTokenType::Crap),
            1 => Ok(GameTokenType::Carat),
            2 => Ok(GameTokenType::Bj),
            3 => Ok(GameTokenType::Roul),
            4 => Ok(GameTokenType::War),
            5 => Ok(GameTokenType::Sico),
            6 => Ok(GameTokenType::Tcp),
            7 => Ok(GameTokenType::Vpk),
            8 => Ok(GameTokenType::Uth),
            _ => Err(ProgramError::InvalidArgument),
        }
    }
}

/// Get the mint address for a game token type.
fn get_game_token_mint(token_type: GameTokenType) -> Pubkey {
    match token_type {
        GameTokenType::Crap => CRAP_MINT_ADDRESS,
        GameTokenType::Carat => CARAT_MINT_ADDRESS,
        GameTokenType::Bj => BJ_MINT_ADDRESS,
        GameTokenType::Roul => ROUL_MINT_ADDRESS,
        GameTokenType::War => WAR_MINT_ADDRESS,
        GameTokenType::Sico => SICO_MINT_ADDRESS,
        GameTokenType::Tcp => TCP_MINT_ADDRESS,
        GameTokenType::Vpk => VPK_MINT_ADDRESS,
        GameTokenType::Uth => UTH_MINT_ADDRESS,
    }
}

/// Swaps RNG for a game token at 1:1 rate (minus fee).
/// Game tokens are minted to the user (RNG is burned/held).
///
/// This uses a fixed 1:1 rate for simplicity - game tokens are
/// utility tokens for playing specific games, not for trading.
///
/// Account layout:
/// 0: user (signer)
/// 1: exchange_pool (PDA, writable) - for fee tracking
/// 2: rng_vault (PDA, writable) - RNG goes here
/// 3: user_rng_ata (writable) - user's RNG source
/// 4: user_game_ata (writable) - user's game token destination
/// 5: game_mint (writable) - game token mint (for minting)
/// 6: rng_mint - RNG token mint
/// 7: token_program
pub fn process_swap_rng_to_game_token(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = SwapRngToGameToken::try_from_bytes(data)?;
    let rng_amount = u64::from_le_bytes(args.rng_amount);
    let game_token_type = GameTokenType::try_from(args.game_token_type)?;

    sol_log(&format!(
        "SwapRngToGameToken: rng_in={}, game_type={:?}",
        rng_amount, game_token_type
    ));

    // Validate amounts.
    if rng_amount == 0 {
        sol_log("RNG amount must be greater than 0");
        return Err(ProgramError::InvalidArgument);
    }

    // Load accounts.
    let [user_info, exchange_pool_info, rng_vault_info, user_rng_ata, user_game_ata, game_mint, rng_mint, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    user_info.is_signer()?;
    exchange_pool_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_POOL], &ore_api::ID)?;
    rng_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_RNG_VAULT], &ore_api::ID)?;
    user_rng_ata.is_writable()?;
    user_game_ata.is_writable()?;
    rng_mint.has_address(&RNG_MINT_ADDRESS)?;
    token_program.is_program(&spl_token::ID)?;

    // Validate game token mint.
    let expected_mint = get_game_token_mint(game_token_type);
    game_mint.has_address(&expected_mint)?;
    game_mint.is_writable()?;

    // Pool must exist and be active.
    if exchange_pool_info.data_is_empty() {
        sol_log("Pool not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Get pool bump for signing.
    let (_, pool_bump) = exchange_pool_pda();

    // Load pool state for fee calculation.
    let exchange_pool = exchange_pool_info.as_account::<ExchangePool>(&ore_api::ID)?;

    if !exchange_pool.is_active() {
        sol_log("Pool is not active");
        return Err(ProgramError::InvalidAccountData);
    }

    // Calculate fee (1% of RNG amount).
    let total_fee = rng_amount
        .checked_mul(exchange_pool.fee_numerator)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(exchange_pool.fee_denominator)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // 50% to protocol, 50% kept in RNG vault (for LPs when they provide RNG liquidity).
    let protocol_fee = total_fee / 2;

    // Game tokens minted = RNG in - total fee (1:1 rate minus fee).
    let game_tokens_out = rng_amount
        .checked_sub(total_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!(
        "Swap: rng_in={}, game_out={}, fee={}",
        rng_amount, game_tokens_out, total_fee
    ));

    // Transfer RNG from user to vault.
    invoke(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            user_rng_ata.key,
            rng_vault_info.key,
            user_info.key,
            &[],
            rng_amount,
        )?,
        &[
            user_rng_ata.clone(),
            rng_vault_info.clone(),
            user_info.clone(),
            token_program.clone(),
        ],
    )?;

    // Mint game tokens to user.
    // The pool PDA is the mint authority for game tokens.
    let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
    invoke_signed(
        &spl_token::instruction::mint_to(
            &spl_token::ID,
            game_mint.key,
            user_game_ata.key,
            exchange_pool_info.key,
            &[],
            game_tokens_out,
        )?,
        &[
            game_mint.clone(),
            user_game_ata.clone(),
            exchange_pool_info.clone(),
        ],
        &[pool_seeds],
    )?;

    // Update pool state to track fees.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;
    exchange_pool.protocol_fees_rng = exchange_pool
        .protocol_fees_rng
        .checked_add(protocol_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.total_swaps = exchange_pool
        .total_swaps
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!(
        "Swap complete: minted {} game tokens, protocol_fee={}",
        game_tokens_out, protocol_fee
    ));

    Ok(())
}

/// Swaps a game token for RNG at 1:1 rate (minus fee).
/// Game tokens are burned from user, RNG is transferred from vault.
///
/// Account layout:
/// 0: user (signer)
/// 1: exchange_pool (PDA, writable) - for fee tracking
/// 2: rng_vault (PDA, writable) - RNG comes from here
/// 3: user_rng_ata (writable) - user's RNG destination
/// 4: user_game_ata (writable) - user's game token source (to burn)
/// 5: game_mint (writable) - game token mint (for burning)
/// 6: rng_mint - RNG token mint
/// 7: token_program
pub fn process_swap_game_token_to_rng(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = SwapGameTokenToRng::try_from_bytes(data)?;
    let game_token_amount = u64::from_le_bytes(args.game_token_amount);
    let game_token_type = GameTokenType::try_from(args.game_token_type)?;

    sol_log(&format!(
        "SwapGameTokenToRng: game_in={}, game_type={:?}",
        game_token_amount, game_token_type
    ));

    // Validate amounts.
    if game_token_amount == 0 {
        sol_log("Game token amount must be greater than 0");
        return Err(ProgramError::InvalidArgument);
    }

    // Load accounts.
    let [user_info, exchange_pool_info, rng_vault_info, user_rng_ata, user_game_ata, game_mint, rng_mint, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    user_info.is_signer()?;
    exchange_pool_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_POOL], &ore_api::ID)?;
    rng_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_RNG_VAULT], &ore_api::ID)?;
    user_rng_ata.is_writable()?;
    user_game_ata.is_writable()?;
    rng_mint.has_address(&RNG_MINT_ADDRESS)?;
    token_program.is_program(&spl_token::ID)?;

    // Validate game token mint.
    let expected_mint = get_game_token_mint(game_token_type);
    game_mint.has_address(&expected_mint)?;
    game_mint.is_writable()?;

    // Pool must exist and be active.
    if exchange_pool_info.data_is_empty() {
        sol_log("Pool not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Get pool bump for signing.
    let (_, pool_bump) = exchange_pool_pda();

    // Load pool state for fee calculation.
    let exchange_pool = exchange_pool_info.as_account::<ExchangePool>(&ore_api::ID)?;

    if !exchange_pool.is_active() {
        sol_log("Pool is not active");
        return Err(ProgramError::InvalidAccountData);
    }

    // Calculate fee (1% of game token amount).
    let total_fee = game_token_amount
        .checked_mul(exchange_pool.fee_numerator)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(exchange_pool.fee_denominator)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // 50% to protocol, 50% kept in vault.
    let protocol_fee = total_fee / 2;

    // RNG out = game tokens in - total fee (1:1 rate minus fee).
    let rng_out = game_token_amount
        .checked_sub(total_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!(
        "Swap: game_in={}, rng_out={}, fee={}",
        game_token_amount, rng_out, total_fee
    ));

    // Burn game tokens from user.
    invoke(
        &spl_token::instruction::burn(
            &spl_token::ID,
            user_game_ata.key,
            game_mint.key,
            user_info.key,
            &[],
            game_token_amount,
        )?,
        &[
            user_game_ata.clone(),
            game_mint.clone(),
            user_info.clone(),
        ],
    )?;

    // Transfer RNG from vault to user.
    let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            rng_vault_info.key,
            user_rng_ata.key,
            exchange_pool_info.key,
            &[],
            rng_out,
        )?,
        &[
            rng_vault_info.clone(),
            user_rng_ata.clone(),
            exchange_pool_info.clone(),
            token_program.clone(),
        ],
        &[pool_seeds],
    )?;

    // Update pool state to track fees.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;
    exchange_pool.protocol_fees_rng = exchange_pool
        .protocol_fees_rng
        .checked_add(protocol_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.total_swaps = exchange_pool
        .total_swaps
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!(
        "Swap complete: burned {} game tokens, sent {} RNG, protocol_fee={}",
        game_token_amount, rng_out, protocol_fee
    ));

    Ok(())
}

use ore_api::prelude::*;
use solana_program::clock::Clock;
use solana_program::log::sol_log;
use solana_program::program::invoke;
use solana_program::program::invoke_signed;
use solana_program::program_pack::Pack;
use solana_program::sysvar::Sysvar;
use steel::*;

/// Initializes the exchange pool with initial SOL/RNG liquidity.
/// Creates the pool PDA, LP mint, and token vaults.
///
/// Account layout:
/// 0: admin (signer, payer)
/// 1: exchange_pool (PDA, writable)
/// 2: lp_mint (PDA, writable)
/// 3: sol_vault (PDA, writable) - wrapped SOL account
/// 4: rng_vault (PDA, writable) - RNG token account
/// 5: admin_rng_ata (writable) - admin's RNG source
/// 6: admin_lp_ata (writable) - admin's LP destination
/// 7: rng_mint - RNG token mint
/// 8: sol_mint - wrapped SOL mint (native)
/// 9: system_program
/// 10: token_program
/// 11: associated_token_program
/// 12: rent
pub fn process_initialize_exchange_pool(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = InitializeExchangePool::try_from_bytes(data)?;
    let sol_amount = u64::from_le_bytes(args.sol_amount);
    let rng_amount = u64::from_le_bytes(args.rng_amount);

    sol_log(&format!(
        "InitializeExchangePool: sol={}, rng={}",
        sol_amount, rng_amount
    ));

    // Validate minimum initial liquidity.
    if sol_amount < EXCHANGE_MIN_INITIAL_SOL {
        sol_log("SOL amount below minimum");
        return Err(ProgramError::InvalidArgument);
    }
    if rng_amount < EXCHANGE_MIN_INITIAL_RNG {
        sol_log("RNG amount below minimum");
        return Err(ProgramError::InvalidArgument);
    }

    // Load accounts.
    let [admin_info, exchange_pool_info, lp_mint_info, sol_vault_info, rng_vault_info, admin_rng_ata, admin_lp_ata, rng_mint, sol_mint, system_program, token_program, associated_token_program, rent_info] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    admin_info.is_signer()?;
    exchange_pool_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_POOL], &ore_api::ID)?;
    lp_mint_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_LP_MINT], &ore_api::ID)?;
    sol_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_SOL_VAULT], &ore_api::ID)?;
    rng_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_RNG_VAULT], &ore_api::ID)?;
    admin_rng_ata.is_writable()?;
    admin_lp_ata.is_writable()?;
    rng_mint.has_address(&RNG_MINT_ADDRESS)?;
    sol_mint.has_address(&SOL_MINT)?;
    system_program.is_program(&system_program::ID)?;
    token_program.is_program(&spl_token::ID)?;
    associated_token_program.is_program(&spl_associated_token_account::ID)?;

    // Pool must not already exist.
    if !exchange_pool_info.data_is_empty() {
        sol_log("Pool already initialized");
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    // Get bumps for PDAs.
    let (_, pool_bump) = exchange_pool_pda();
    let (_, lp_mint_bump) = exchange_lp_mint_pda();
    let (_, sol_vault_bump) = exchange_sol_vault_pda();
    let (_, rng_vault_bump) = exchange_rng_vault_pda();

    // Create pool account.
    create_program_account::<ExchangePool>(
        exchange_pool_info,
        system_program,
        admin_info,
        &ore_api::ID,
        &[EXCHANGE_POOL],
    )?;
    sol_log("Created exchange pool account");

    // Create LP token mint as PDA.
    let lp_mint_seeds = &[EXCHANGE_LP_MINT, &[lp_mint_bump]];
    invoke_signed(
        &solana_program::system_instruction::create_account(
            admin_info.key,
            lp_mint_info.key,
            solana_program::rent::Rent::get()?.minimum_balance(spl_token::state::Mint::LEN),
            spl_token::state::Mint::LEN as u64,
            &spl_token::ID,
        ),
        &[admin_info.clone(), lp_mint_info.clone(), system_program.clone()],
        &[lp_mint_seeds],
    )?;

    // Initialize LP mint with pool authority.
    invoke_signed(
        &spl_token::instruction::initialize_mint(
            &spl_token::ID,
            lp_mint_info.key,
            exchange_pool_info.key, // mint authority is the pool
            Some(exchange_pool_info.key), // freeze authority
            LP_TOKEN_DECIMALS,
        )?,
        &[lp_mint_info.clone(), rent_info.clone()],
        &[lp_mint_seeds],
    )?;
    sol_log("Created LP mint");

    // Create SOL vault (wrapped SOL) as PDA token account.
    let sol_vault_seeds = &[EXCHANGE_SOL_VAULT, &[sol_vault_bump]];
    invoke_signed(
        &solana_program::system_instruction::create_account(
            admin_info.key,
            sol_vault_info.key,
            solana_program::rent::Rent::get()?.minimum_balance(spl_token::state::Account::LEN),
            spl_token::state::Account::LEN as u64,
            &spl_token::ID,
        ),
        &[admin_info.clone(), sol_vault_info.clone(), system_program.clone()],
        &[sol_vault_seeds],
    )?;
    invoke_signed(
        &spl_token::instruction::initialize_account(
            &spl_token::ID,
            sol_vault_info.key,
            sol_mint.key,
            exchange_pool_info.key, // pool is owner
        )?,
        &[
            sol_vault_info.clone(),
            sol_mint.clone(),
            exchange_pool_info.clone(),
            rent_info.clone(),
        ],
        &[sol_vault_seeds],
    )?;
    sol_log("Created SOL vault");

    // Create RNG vault as PDA token account.
    let rng_vault_seeds = &[EXCHANGE_RNG_VAULT, &[rng_vault_bump]];
    invoke_signed(
        &solana_program::system_instruction::create_account(
            admin_info.key,
            rng_vault_info.key,
            solana_program::rent::Rent::get()?.minimum_balance(spl_token::state::Account::LEN),
            spl_token::state::Account::LEN as u64,
            &spl_token::ID,
        ),
        &[admin_info.clone(), rng_vault_info.clone(), system_program.clone()],
        &[rng_vault_seeds],
    )?;
    invoke_signed(
        &spl_token::instruction::initialize_account(
            &spl_token::ID,
            rng_vault_info.key,
            rng_mint.key,
            exchange_pool_info.key, // pool is owner
        )?,
        &[
            rng_vault_info.clone(),
            rng_mint.clone(),
            exchange_pool_info.clone(),
            rent_info.clone(),
        ],
        &[rng_vault_seeds],
    )?;
    sol_log("Created RNG vault");

    // Create admin's LP ATA if needed.
    if admin_lp_ata.data_is_empty() {
        create_associated_token_account(
            admin_info,
            admin_info,
            admin_lp_ata,
            lp_mint_info,
            system_program,
            token_program,
            associated_token_program,
        )?;
        sol_log("Created admin LP ATA");
    }

    // Transfer SOL to vault (wrap as wSOL).
    invoke(
        &solana_program::system_instruction::transfer(admin_info.key, sol_vault_info.key, sol_amount),
        &[admin_info.clone(), sol_vault_info.clone()],
    )?;
    // Sync native to update token balance.
    invoke(
        &spl_token::instruction::sync_native(&spl_token::ID, sol_vault_info.key)?,
        &[sol_vault_info.clone()],
    )?;
    sol_log(&format!("Deposited {} lamports to SOL vault", sol_amount));

    // Transfer RNG from admin to vault.
    invoke(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            admin_rng_ata.key,
            rng_vault_info.key,
            admin_info.key,
            &[],
            rng_amount,
        )?,
        &[
            admin_rng_ata.clone(),
            rng_vault_info.clone(),
            admin_info.clone(),
            token_program.clone(),
        ],
    )?;
    sol_log(&format!("Deposited {} RNG to RNG vault", rng_amount));

    // Calculate initial LP tokens: sqrt(sol * rng) - MINIMUM_LIQUIDITY
    let product = (sol_amount as u128)
        .checked_mul(rng_amount as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    let sqrt_product = integer_sqrt(product);
    let lp_tokens = sqrt_product
        .checked_sub(EXCHANGE_MINIMUM_LIQUIDITY as u128)
        .ok_or(ProgramError::ArithmeticOverflow)? as u64;

    if lp_tokens == 0 {
        sol_log("Initial liquidity too small for LP tokens");
        return Err(ProgramError::InvalidArgument);
    }

    // Mint LP tokens to admin.
    let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
    invoke_signed(
        &spl_token::instruction::mint_to(
            &spl_token::ID,
            lp_mint_info.key,
            admin_lp_ata.key,
            exchange_pool_info.key, // mint authority
            &[],
            lp_tokens,
        )?,
        &[
            lp_mint_info.clone(),
            admin_lp_ata.clone(),
            exchange_pool_info.clone(),
        ],
        &[pool_seeds],
    )?;
    sol_log(&format!("Minted {} LP tokens to admin", lp_tokens));

    // Initialize pool state.
    let clock = Clock::get()?;
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;
    exchange_pool.sol_vault = *sol_vault_info.key;
    exchange_pool.rng_vault = *rng_vault_info.key;
    exchange_pool.lp_mint = *lp_mint_info.key;
    exchange_pool.admin = *admin_info.key;
    exchange_pool.sol_reserve = sol_amount;
    exchange_pool.rng_reserve = rng_amount;
    let k = (sol_amount as u128)
        .checked_mul(rng_amount as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.set_k(k);
    exchange_pool.total_lp_supply = lp_tokens + EXCHANGE_MINIMUM_LIQUIDITY; // Include locked minimum
    exchange_pool.fee_numerator = EXCHANGE_DEFAULT_FEE_NUMERATOR;
    exchange_pool.fee_denominator = EXCHANGE_DEFAULT_FEE_DENOMINATOR;
    exchange_pool.protocol_fees_sol = 0;
    exchange_pool.protocol_fees_rng = 0;
    exchange_pool.total_volume_sol = 0;
    exchange_pool.total_fees_collected_sol = 0;
    exchange_pool.total_swaps = 0;
    exchange_pool.minimum_liquidity = EXCHANGE_MINIMUM_LIQUIDITY;
    exchange_pool.created_at = clock.unix_timestamp;
    exchange_pool.last_swap_at = 0;
    exchange_pool.bump = pool_bump;
    exchange_pool.status = EXCHANGE_STATUS_ACTIVE;

    sol_log(&format!(
        "Pool initialized: k={}, LP supply={}",
        k,
        exchange_pool.total_lp_supply
    ));

    Ok(())
}

/// Integer square root using Newton's method.
fn integer_sqrt(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

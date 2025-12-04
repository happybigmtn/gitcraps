// Domain modules
pub mod craps;
pub mod mining;
pub mod staking;
pub mod claiming;
pub mod admin;

use craps::*;
use mining::*;
use staking::*;
use claiming::*;
use admin::*;

use ore_api::instruction::*;
use steel::*;

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let (ix, data) = parse_instruction(&ore_api::ID, program_id, data)?;

    match ix {
        // Mining
        OreInstruction::Initialize => process_initialize(accounts, data)?,
        OreInstruction::Automate => process_automate(accounts, data)?,
        OreInstruction::Checkpoint => process_checkpoint(accounts, data)?,
        OreInstruction::Deploy => process_deploy(accounts, data)?,
        OreInstruction::Log => process_log(accounts, data)?,
        OreInstruction::Close => process_close(accounts, data)?,
        OreInstruction::Reset => process_reset(accounts, data)?,
        OreInstruction::RecycleSOL => process_recycle_sol(accounts, data)?,

        // Claiming
        OreInstruction::ClaimSOL => process_claim_sol(accounts, data)?,
        OreInstruction::ClaimORE => process_claim_ore(accounts, data)?,

        // Staking
        OreInstruction::Deposit => process_deposit(accounts, data)?,
        OreInstruction::Withdraw => process_withdraw(accounts, data)?,
        OreInstruction::ClaimYield => process_claim_yield(accounts, data)?,

        // Admin
        OreInstruction::Bury => process_bury(accounts, data)?,
        OreInstruction::Wrap => process_wrap(accounts, data)?,
        OreInstruction::SetAdmin => process_set_admin(accounts, data)?,
        OreInstruction::SetFeeCollector => process_set_fee_collector(accounts, data)?,
        OreInstruction::SetSwapProgram => process_set_swap_program(accounts, data)?,
        OreInstruction::SetVarAddress => process_set_var_address(accounts, data)?,
        OreInstruction::NewVar => process_new_var(accounts, data)?,
        OreInstruction::SetAdminFee => process_set_admin_fee(accounts, data)?,
        OreInstruction::StartRound => process_start_round(accounts, data)?,

        // Craps
        OreInstruction::PlaceCrapsBet => process_place_craps_bet(accounts, data)?,
        OreInstruction::SettleCraps => process_settle_craps(accounts, data)?,
        OreInstruction::ClaimCrapsWinnings => process_claim_craps_winnings(accounts, data)?,
        OreInstruction::FundCrapsHouse => process_fund_craps_house(accounts, data)?,
        // SECURITY FIX 2.1: Force settle for reserved payout DoS prevention
        OreInstruction::ForceSettleCraps => process_force_settle_craps(accounts, data)?,
        // SECURITY FIX 2.2: Claim unpaid debt from insolvency
        OreInstruction::ClaimCrapsDebt => process_claim_craps_debt(accounts, data)?,

        // Migration
        OreInstruction::MigrateRound => process_migrate_round(accounts, data)?,
        OreInstruction::MigrateMiner => process_migrate_miner(accounts, data)?,
    }

    Ok(())
}

entrypoint!(process_instruction);

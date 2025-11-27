mod automate;
mod bury;
mod checkpoint;
mod claim_craps_winnings;
mod claim_ore;
mod claim_sol;
mod claim_yield;
mod close;
mod craps_utils;
mod deploy;
mod deposit;
mod fund_craps_house;
mod initialize;
mod log;
mod new_var;
mod place_craps_bet;
mod recycle_sol;
mod reset;
mod set_admin;
mod set_admin_fee;
mod set_fee_collector;
mod set_swap_program;
mod set_var_address;
mod settle_craps;
mod start_round;
mod withdraw;
mod wrap;

use automate::*;
use bury::*;
use checkpoint::*;
use claim_craps_winnings::*;
use claim_ore::*;
use claim_sol::*;
use claim_yield::*;
use close::*;
use deploy::*;
use deposit::*;
use fund_craps_house::*;
use initialize::*;
use log::*;
use new_var::*;
use place_craps_bet::*;
use recycle_sol::*;
use reset::*;
use set_admin::*;
use set_admin_fee::*;
use set_fee_collector::*;
use set_swap_program::*;
use set_var_address::*;
use settle_craps::*;
use start_round::*;
use withdraw::*;
use wrap::*;

use ore_api::instruction::*;
use steel::*;

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let (ix, data) = parse_instruction(&ore_api::ID, program_id, data)?;

    match ix {
        // Miner
        OreInstruction::Initialize => process_initialize(accounts, data)?,
        OreInstruction::Automate => process_automate(accounts, data)?,
        OreInstruction::Checkpoint => process_checkpoint(accounts, data)?,
        OreInstruction::ClaimSOL => process_claim_sol(accounts, data)?,
        OreInstruction::ClaimORE => process_claim_ore(accounts, data)?,
        OreInstruction::Deploy => process_deploy(accounts, data)?,
        OreInstruction::Log => process_log(accounts, data)?,
        OreInstruction::Close => process_close(accounts, data)?,
        OreInstruction::Reset => process_reset(accounts, data)?,
        OreInstruction::RecycleSOL => process_recycle_sol(accounts, data)?,

        // Staker
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
    }

    Ok(())
}

entrypoint!(process_instruction);

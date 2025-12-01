//! Admin module - administrative functions

mod initialize;
mod set_admin;
mod set_admin_fee;
mod set_fee_collector;
mod set_swap_program;
mod set_var_address;
mod new_var;
mod bury;
mod wrap;
mod migrate_round;
mod migrate_miner;

pub use initialize::*;
pub use set_admin::*;
pub use set_admin_fee::*;
pub use set_fee_collector::*;
pub use set_swap_program::*;
pub use set_var_address::*;
pub use new_var::*;
pub use bury::*;
pub use wrap::*;
pub use migrate_round::*;
pub use migrate_miner::*;

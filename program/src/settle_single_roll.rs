//! Helper functions for settling single-roll craps bets
//! (Field, Any Seven, Any Craps, Yo, Aces, Twelve)

#![allow(dead_code)]

use ore_api::consts::*;
use crate::craps_utils::{calculate_payout, is_field_winner, is_craps};

/// Calculate field bet payout
/// Returns (total_return, is_winner) where total_return includes original bet if won
pub fn calculate_field_payout(bet_amount: u64, dice_sum: u8) -> Result<(u64, bool), solana_program::program_error::ProgramError> {
    use solana_program::program_error::ProgramError;

    if !is_field_winner(dice_sum) {
        return Ok((0, false));
    }

    let (num, den) = if dice_sum == 2 || dice_sum == 12 {
        (FIELD_PAYOUT_2_12_NUM, FIELD_PAYOUT_2_12_DEN)
    } else {
        (FIELD_PAYOUT_NORMAL_NUM, FIELD_PAYOUT_NORMAL_DEN)
    };

    let payout = calculate_payout(bet_amount, num, den);
    let total_return = bet_amount
        .checked_add(payout)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok((total_return, true))
}

/// Calculate any seven bet payout
/// Returns (total_return, is_winner) where total_return includes original bet if won
pub fn calculate_any_seven_payout(bet_amount: u64, dice_sum: u8) -> Result<(u64, bool), solana_program::program_error::ProgramError> {
    use solana_program::program_error::ProgramError;

    if dice_sum != 7 {
        return Ok((0, false));
    }

    let payout = calculate_payout(bet_amount, ANY_SEVEN_PAYOUT_NUM, ANY_SEVEN_PAYOUT_DEN);
    let total_return = bet_amount
        .checked_add(payout)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok((total_return, true))
}

/// Calculate any craps bet payout (2, 3, or 12)
/// Returns (total_return, is_winner) where total_return includes original bet if won
pub fn calculate_any_craps_payout(bet_amount: u64, dice_sum: u8) -> Result<(u64, bool), solana_program::program_error::ProgramError> {
    use solana_program::program_error::ProgramError;

    if !is_craps(dice_sum) {
        return Ok((0, false));
    }

    let payout = calculate_payout(bet_amount, ANY_CRAPS_PAYOUT_NUM, ANY_CRAPS_PAYOUT_DEN);
    let total_return = bet_amount
        .checked_add(payout)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok((total_return, true))
}

/// Calculate yo (11) bet payout
/// Returns (total_return, is_winner) where total_return includes original bet if won
pub fn calculate_yo_payout(bet_amount: u64, dice_sum: u8) -> Result<(u64, bool), solana_program::program_error::ProgramError> {
    use solana_program::program_error::ProgramError;

    if dice_sum != 11 {
        return Ok((0, false));
    }

    let payout = calculate_payout(bet_amount, YO_ELEVEN_PAYOUT_NUM, YO_ELEVEN_PAYOUT_DEN);
    let total_return = bet_amount
        .checked_add(payout)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok((total_return, true))
}

/// Calculate aces (2) bet payout
/// Returns (total_return, is_winner) where total_return includes original bet if won
pub fn calculate_aces_payout(bet_amount: u64, dice_sum: u8) -> Result<(u64, bool), solana_program::program_error::ProgramError> {
    use solana_program::program_error::ProgramError;

    if dice_sum != 2 {
        return Ok((0, false));
    }

    let payout = calculate_payout(bet_amount, ACES_PAYOUT_NUM, ACES_PAYOUT_DEN);
    let total_return = bet_amount
        .checked_add(payout)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok((total_return, true))
}

/// Calculate twelve bet payout
/// Returns (total_return, is_winner) where total_return includes original bet if won
pub fn calculate_twelve_payout(bet_amount: u64, dice_sum: u8) -> Result<(u64, bool), solana_program::program_error::ProgramError> {
    use solana_program::program_error::ProgramError;

    if dice_sum != 12 {
        return Ok((0, false));
    }

    let payout = calculate_payout(bet_amount, TWELVE_PAYOUT_NUM, TWELVE_PAYOUT_DEN);
    let total_return = bet_amount
        .checked_add(payout)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok((total_return, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_payout_2_12() {
        // Field bet on 2 or 12 pays 2:1
        let (total, won) = calculate_field_payout(100, 2).unwrap();
        assert!(won);
        assert_eq!(total, 300); // 100 bet + 200 payout

        let (total, won) = calculate_field_payout(100, 12).unwrap();
        assert!(won);
        assert_eq!(total, 300);
    }

    #[test]
    fn test_field_payout_normal() {
        // Field bet on 3,4,9,10,11 pays 1:1
        let (total, won) = calculate_field_payout(100, 3).unwrap();
        assert!(won);
        assert_eq!(total, 200); // 100 bet + 100 payout

        let (total, won) = calculate_field_payout(100, 11).unwrap();
        assert!(won);
        assert_eq!(total, 200);
    }

    #[test]
    fn test_field_payout_loss() {
        // Field loses on 5,6,7,8
        let (total, won) = calculate_field_payout(100, 7).unwrap();
        assert!(!won);
        assert_eq!(total, 0);
    }

    #[test]
    fn test_any_seven() {
        // Any Seven pays 4:1
        let (total, won) = calculate_any_seven_payout(100, 7).unwrap();
        assert!(won);
        assert_eq!(total, 500); // 100 bet + 400 payout

        let (total, won) = calculate_any_seven_payout(100, 6).unwrap();
        assert!(!won);
        assert_eq!(total, 0);
    }

    #[test]
    fn test_any_craps() {
        // Any Craps pays 7:1
        let (total, won) = calculate_any_craps_payout(100, 2).unwrap();
        assert!(won);
        assert_eq!(total, 800); // 100 bet + 700 payout

        let (total, won) = calculate_any_craps_payout(100, 3).unwrap();
        assert!(won);
        assert_eq!(total, 800);

        let (total, won) = calculate_any_craps_payout(100, 12).unwrap();
        assert!(won);
        assert_eq!(total, 800);

        let (total, won) = calculate_any_craps_payout(100, 7).unwrap();
        assert!(!won);
        assert_eq!(total, 0);
    }

    #[test]
    fn test_yo_eleven() {
        // Yo pays 15:1
        let (total, won) = calculate_yo_payout(100, 11).unwrap();
        assert!(won);
        assert_eq!(total, 1600); // 100 bet + 1500 payout

        let (total, won) = calculate_yo_payout(100, 7).unwrap();
        assert!(!won);
        assert_eq!(total, 0);
    }

    #[test]
    fn test_aces() {
        // Aces pays 30:1
        let (total, won) = calculate_aces_payout(100, 2).unwrap();
        assert!(won);
        assert_eq!(total, 3100); // 100 bet + 3000 payout

        let (total, won) = calculate_aces_payout(100, 3).unwrap();
        assert!(!won);
        assert_eq!(total, 0);
    }

    #[test]
    fn test_twelve() {
        // Twelve pays 30:1
        let (total, won) = calculate_twelve_payout(100, 12).unwrap();
        assert!(won);
        assert_eq!(total, 3100); // 100 bet + 3000 payout

        let (total, won) = calculate_twelve_payout(100, 11).unwrap();
        assert!(!won);
        assert_eq!(total, 0);
    }
}

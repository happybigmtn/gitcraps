#![allow(dead_code)]

use ore_api::consts::BOARD_SIZE;

/// Convert a board square index (0-35) to dice sum (2-12).
/// Square index = (die1 - 1) * 6 + (die2 - 1)
/// So die1 = square / 6 + 1, die2 = square % 6 + 1
pub fn square_to_dice_sum(square: usize) -> u8 {
    if square >= BOARD_SIZE {
        return 0;
    }
    let die1 = (square / 6) + 1;
    let die2 = (square % 6) + 1;
    (die1 + die2) as u8
}

/// Get the individual dice values from a square.
pub fn square_to_dice(square: usize) -> (u8, u8) {
    let die1 = ((square / 6) + 1) as u8;
    let die2 = ((square % 6) + 1) as u8;
    (die1, die2)
}

/// Check if a square represents a hardway (doubles: 1-1, 2-2, 3-3, 4-4, 5-5, 6-6).
/// Hardway squares are at indices 0, 7, 14, 21, 28, 35.
pub fn is_hardway(square: usize) -> bool {
    square < BOARD_SIZE && square % 7 == 0
}

/// Check if dice sum is a "craps" (2, 3, or 12).
pub fn is_craps(sum: u8) -> bool {
    sum == 2 || sum == 3 || sum == 12
}

/// Check if dice sum is a "natural" (7 or 11).
pub fn is_natural(sum: u8) -> bool {
    sum == 7 || sum == 11
}

/// Check if dice sum is a point number (4, 5, 6, 8, 9, 10).
pub fn is_point_number(sum: u8) -> bool {
    matches!(sum, 4 | 5 | 6 | 8 | 9 | 10)
}

/// Check if dice sum wins a field bet (2, 3, 4, 9, 10, 11, 12).
pub fn is_field_winner(sum: u8) -> bool {
    matches!(sum, 2 | 3 | 4 | 9 | 10 | 11 | 12)
}

/// Get the hardway number from a hardway square (0->2, 7->4, 14->6, 21->8, 28->10, 35->12).
pub fn hardway_square_to_sum(square: usize) -> Option<u8> {
    match square {
        0 => Some(2),   // 1+1
        7 => Some(4),   // 2+2
        14 => Some(6),  // 3+3
        21 => Some(8),  // 4+4
        28 => Some(10), // 5+5
        35 => Some(12), // 6+6
        _ => None,
    }
}

/// Check if a dice roll hit a specific hardway.
/// hardway_num is the hardway target (4, 6, 8, or 10).
pub fn hit_hardway(square: usize, hardway_num: u8) -> bool {
    let sum = square_to_dice_sum(square);
    if sum != hardway_num {
        return false;
    }
    is_hardway(square)
}

/// Check if hardway bet should lose (7 rolled or easy way).
/// Returns (lost, reason): reason 0=7, 1=easy way
pub fn hardway_loses(square: usize, hardway_num: u8) -> bool {
    let sum = square_to_dice_sum(square);
    // Hardway loses on 7
    if sum == 7 {
        return true;
    }
    // Hardway loses on easy way (same sum but not doubles)
    if sum == hardway_num && !is_hardway(square) {
        return true;
    }
    false
}

/// Get all squares that produce a given sum.
pub fn sum_to_squares(sum: u8) -> Vec<usize> {
    let mut squares = Vec::new();
    for d1 in 1u8..=6 {
        let d2 = sum.saturating_sub(d1);
        if d2 >= 1 && d2 <= 6 {
            let square = ((d1 - 1) as usize) * 6 + ((d2 - 1) as usize);
            squares.push(square);
        }
    }
    squares
}

/// Convert point number (4,5,6,8,9,10) to array index (0-5).
pub fn point_to_index(point: u8) -> Option<usize> {
    match point {
        4 => Some(0),
        5 => Some(1),
        6 => Some(2),
        8 => Some(3),
        9 => Some(4),
        10 => Some(5),
        _ => None,
    }
}

/// Convert array index (0-5) to point number (4,5,6,8,9,10).
pub fn index_to_point(index: usize) -> Option<u8> {
    match index {
        0 => Some(4),
        1 => Some(5),
        2 => Some(6),
        3 => Some(8),
        4 => Some(9),
        5 => Some(10),
        _ => None,
    }
}

/// Convert hardway sum (4,6,8,10) to array index (0-3).
pub fn hardway_to_index(hardway: u8) -> Option<usize> {
    match hardway {
        4 => Some(0),
        6 => Some(1),
        8 => Some(2),
        10 => Some(3),
        _ => None,
    }
}

/// Convert dice sum (2-12) to array index (0-10) for Yes/No/Next bets.
pub fn sum_to_index(sum: u8) -> Option<usize> {
    if sum >= 2 && sum <= 12 {
        Some((sum - 2) as usize)
    } else {
        None
    }
}

/// Convert array index (0-10) to dice sum (2-12).
pub fn index_to_sum(index: usize) -> Option<u8> {
    if index <= 10 {
        Some((index + 2) as u8)
    } else {
        None
    }
}

/// Check if sum is valid for Yes/No bets (2-12 except 7).
pub fn is_valid_yes_no_sum(sum: u8) -> bool {
    sum >= 2 && sum <= 12 && sum != 7
}

/// Calculate payout for a winning bet.
/// Returns the amount won (not including original bet).
pub fn calculate_payout(bet_amount: u64, payout_num: u64, payout_den: u64) -> u64 {
    // payout = bet_amount * payout_num / payout_den
    // Use u128 to avoid overflow
    ((bet_amount as u128 * payout_num as u128) / payout_den as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_square_to_dice_sum() {
        assert_eq!(square_to_dice_sum(0), 2);  // 1+1
        assert_eq!(square_to_dice_sum(1), 3);  // 1+2
        assert_eq!(square_to_dice_sum(5), 7);  // 1+6
        assert_eq!(square_to_dice_sum(6), 3);  // 2+1
        assert_eq!(square_to_dice_sum(7), 4);  // 2+2
        assert_eq!(square_to_dice_sum(35), 12); // 6+6
    }

    #[test]
    fn test_is_hardway() {
        assert!(is_hardway(0));  // 1+1
        assert!(is_hardway(7));  // 2+2
        assert!(is_hardway(14)); // 3+3
        assert!(is_hardway(21)); // 4+4
        assert!(is_hardway(28)); // 5+5
        assert!(is_hardway(35)); // 6+6
        assert!(!is_hardway(1)); // 1+2
        assert!(!is_hardway(6)); // 2+1
    }

    #[test]
    fn test_is_craps() {
        assert!(is_craps(2));
        assert!(is_craps(3));
        assert!(is_craps(12));
        assert!(!is_craps(7));
        assert!(!is_craps(11));
    }

    #[test]
    fn test_is_natural() {
        assert!(is_natural(7));
        assert!(is_natural(11));
        assert!(!is_natural(2));
        assert!(!is_natural(6));
    }

    #[test]
    fn test_calculate_payout() {
        // 1:1 payout
        assert_eq!(calculate_payout(100, 1, 1), 100);
        // 2:1 payout
        assert_eq!(calculate_payout(100, 2, 1), 200);
        // 9:5 payout (place 4/10)
        assert_eq!(calculate_payout(50, 9, 5), 90);
        // 7:6 payout (place 6/8)
        assert_eq!(calculate_payout(60, 7, 6), 70);
    }
}

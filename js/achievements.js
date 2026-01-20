import { saveAchievements } from './storage.js';

// Minimal "prizes" system: unlock milestones and award bonus cash.
// Return { unlocked: string[], bonusCash: number }
export function evaluateRunMilestones({ timeSeconds, level, cashEarned }, unlockedSet) {
  const newlyUnlocked = [];
  let bonusCash = 0;

  const milestones = [
    { id: 'survive_30', label: 'Survived 30s', when: timeSeconds >= 30, bonus: 10 },
    { id: 'survive_60', label: 'Survived 60s', when: timeSeconds >= 60, bonus: 25 },
    { id: 'reach_5', label: 'Reached Level 5', when: level >= 5, bonus: 15 },
    { id: 'reach_10', label: 'Reached Level 10', when: level >= 10, bonus: 40 },
    { id: 'earn_50', label: 'Earned 50 CC in a run', when: cashEarned >= 50, bonus: 20 },
  ];

  for (const m of milestones) {
    if (m.when && !unlockedSet.has(m.id)) {
      unlockedSet.add(m.id);
      newlyUnlocked.push(m.label);
      bonusCash += m.bonus;
    }
  }

  if (newlyUnlocked.length > 0) saveAchievements(unlockedSet);

  return { unlocked: newlyUnlocked, bonusCash };
}

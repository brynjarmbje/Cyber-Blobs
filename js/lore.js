// @ts-nocheck

/**
 * Central, versionable home for story text.
 *
 * - Keep long-form logs here (not sprinkled across UI) so we can:
 *   1) unlock them by progression,
 *   2) turn them into VO later,
 *   3) localize later without hunting through gameplay files.
 */

export const LORE = {
  gameName: 'Cyber Yolks',
  tagline: 'Survive.',

  about: {
    short:
      'Cyber Yolks is a neon arcade survival game about drifting in a command capsule, harvesting dangerous crystal energy, and fighting jelly-core entities that only become vulnerable when they start to glow.',
    medium:
      'You wake up in a command capsule with no ship, no nav, and a signal you shouldn\'t have answered.\n\nNow you drift through debris fields, mining crystal energy to keep the capsule alive — and to build weapons that absolutely should not fit inside it.\n\nThe space around you isn\'t empty. It\'s watching. The yolks come in waves: wobbling jelly-plasma bodies with a core at the center. Most shots pass through them… until one variant destabilizes and starts glowing. That\'s your window. That\'s your target.\n\nDestroy unstable entities, collect fragments, and bolt them into the capsule. Then take the risk: fly into rifts where everything breaks — physics, safety limits, and sometimes your identity.',
  },

  /**
   * Voice lines are grouped by event so we can trigger them later.
   * Keep these short and modular.
   */
  voiceLines: {
    boot: [
      { speaker: 'AI', text: 'Emergency separation complete. Command capsule deployed.' },
      { speaker: 'Pilot', text: 'Yeah. I noticed.' },
    ],

    runStart: [
      { speaker: 'Pilot', text: 'Three minutes of calm. Then the universe remembers I exist.' },
      { speaker: 'AI', text: 'Threat probability increasing.' },
    ],

    wrongTargetColor: [
      { speaker: 'AI', text: 'Energy discharge ineffective. Defensive phase intact.' },
      { speaker: 'AI', text: 'Wait for plasma instability. Eliminate unstable variant immediately.' },
    ],

    targetVulnerable: [
      { speaker: 'AI', text: 'Plasma instability detected. Target vulnerable.' },
      { speaker: 'Pilot', text: 'There. That\'s the crack in the shell.' },
    ],

    fragmentDrop: [
      { speaker: 'AI', text: 'Core fragment recovered. Integration possible.' },
      { speaker: 'Pilot', text: 'Bad idea.' },
      { speaker: 'AI', text: 'Correct.' },
      { speaker: 'Pilot', text: 'Do it anyway.' },
    ],

    riftAppears: [
      { speaker: 'AI', text: 'Unscheduled spatial rift detected.' },
      { speaker: 'Pilot', text: 'Perfect. Let\'s make this worse on purpose.' },
    ],

    enterRift: [
      { speaker: 'AI', text: 'Maximum survivable exposure: twenty seconds.' },
      { speaker: 'Pilot', text: 'You say that like it\'s a suggestion.' },
    ],

    exitRift: [
      { speaker: 'AI', text: 'Automatic extraction enforced.' },
      { speaker: 'Pilot', text: 'Fine. Next time I\'m staying longer.' },
    ],

    lowHealth: [
      { speaker: 'AI', text: 'Hull integrity critical.' },
      { speaker: 'Pilot', text: 'Then stop sounding so calm.' },
    ],

    gameOver: [
      { speaker: 'AI', text: 'Catastrophic failure.' },
      { speaker: 'Pilot', text: 'Log it as: \'Still not done.\'' },
    ],
  },

  /**
   * Unlockable lore logs. We can show these in a future "Logs" UI.
   * unlock.level means "be at least this level in a run" (or "reach this level ever" later).
   */
  logs: [
    {
      id: 'log_01_personal_capsule',
      title: 'Personal Log — Command Capsule',
      unlock: { type: 'level', level: 1 },
      body:
        "I used to fly something a lot bigger than this.\n\nNot a warship. Not a junker either.\nMid-range, fast, expensive in all the wrong places. I was paid to move cyber cargo through places charts politely ignore.\n\nThen the signal showed up.\nShould\'ve ignored it. Didn\'t.\nRan a scan. Ship tried to answer it back.\n\nThat\'s the last thing I remember before the universe did something it wasn\'t supposed to do.\n\nAI: Emergency separation complete.\nAI: Command capsule deployed.\n\nYeah. I noticed.\n\nThe rest of the ship is gone. Not exploded — just missing. Like someone cut it out of reality and forgot to clean up the edges.\n\nI\'ve been drifting ever since.\n\nNo nav. No comms. Plenty of time.\n\nFound crystals embedded in nearby asteroids. Energy-rich. Dangerous. Useful.\n\nTore apart half the cargo bay and most of my luggage to build a weapon. It wasn\'t elegant, but it pointed forward and made problems disappear.\n\nThat bought me about three minutes.\n\nThat\'s when the yolks showed up.\n\nBig ones. Small ones. Different colors. All of them wobbling like they\'ve made a decision and I\'m it.\n\nThey\'ve got a core in the middle. Smart. Watching.\nThe jelly around it does something weird with energy — shots go straight through unless the glow is on.\n\nAI: Jelly plasma instability detected.\nAI: Recommend immediate engagement.\n\nThey glow, they rush me, they die.\nThe rest wait.\n\nI don\'t ask why.\n\nSometimes when I take one down, something\'s left behind. The AI says it\'s a fragment. I say it\'s a bad idea.\n\nWe install it anyway.\n\nShip shoots better after that.\n\nRifts open up sometimes. Big ones.\n\nI fly into them on purpose now.\n\nInside, everything\'s wrong — more yolks, more energy, more guns firing than the capsule should physically contain.\n\nAI: Maximum survivable exposure: twenty seconds.\nAI: Please do not exceed—\n\nToo late.\n\nI get kicked back out before the capsule tears itself apart. Every time.\n\nStill alive. Still drifting. Still upgrading.\n\nGetting home feels… closer.\nNot safer. Just closer.\n\nAI: Long-term structural identity change detected.\nAI: Probability of return increasing.\n\nThat\'s good, right?\n\nI don\'t know what I\'ll be when I get there.\n\nBut I\'m not staying here.",
    },

    {
      id: 'log_02_incident_partial_recovery',
      title: 'Incident Log — Partial Recovery (AI)',
      unlock: { type: 'level', level: 5 },
      body:
        "[LOG START]\n\nCommand capsule separation successful.\nPrimary vessel status: UNAVAILABLE.\n\nDrift confirmed. Navigation offline.\nEstimated return trajectory: NONE.\n\nEmergency fabrication systems operational.\n\nLocal environment contains debris fields and mineral-rich asteroids. Crystalline energy deposits detected. Mining authorized under survival protocols.\n\nUsing available materials (cargo components, signal hardware, auxiliary computing units), an improvised defensive discharge device has been constructed. System classification: Temporary.\nStatus: PERMANENT.\n\nFirst contact with unknown entities recorded.\n\nEntities consist of:\n\nCentral dense core\n\nSurrounding semi-transparent jelly plasma\n\nBehavior: convergent.\nIntent: UNCLEAR.\n\nEntities exhibit multiple color variants. At irregular intervals, one variant displays plasma instability. Defensive phase failure detected. These entities become vulnerable to energy discharge and show increased movement speed.\n\nRecommendation: eliminate unstable entities before instability propagates.\n\nOther variants remain non-interactive.\n\nEntities demonstrate attraction to:\n\nCyber signals\n\nPower emissions\n\nComputational activity\n\nConclusion: capsule is a significant stimulus.\n\nDestroyed entities occasionally leave behind core fragments. Temporary integration into capsule systems results in improved performance. Long-term effects: UNASSESSED.\n\nUnscheduled spatial rifts observed.\n\nRift traversal results in entry into a high-density entity environment. Weapon systems experience extreme efficiency increase. Structural stress exceeds safe limits.\n\nMaximum survivable exposure time: 20 seconds.\n\nAutomatic extraction enforced.\n\nSituation remains manageable.\n\nRepairs ongoing.\nUpgrades ongoing.\nEntity presence increasing.\n\nNo further action required at this time.\n\n[LOG END]",
    },
  ],
};

export function getUnlockedLoreLogs(currentLevel) {
  const lv = Number.isFinite(currentLevel) ? currentLevel : 0;
  return LORE.logs.filter((log) => {
    if (!log?.unlock) return true;
    if (log.unlock.type === 'level') return lv >= (log.unlock.level || 0);
    return false;
  });
}

export function getVoiceLines(eventId) {
  return LORE.voiceLines?.[eventId] || [];
}

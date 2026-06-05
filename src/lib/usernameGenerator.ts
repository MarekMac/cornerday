const ADJECTIVES = [
  // Core positive traits
  'Calm', 'Bold', 'Bright', 'Clear', 'Brave', 'Swift', 'Wise', 'Kind', 'Free', 'Strong',
  'Proud', 'Steady', 'Sharp', 'True', 'Solid', 'Warm', 'Quiet', 'Humble', 'Noble', 'Gentle',
  'Fierce', 'Fresh', 'Pure', 'Deep', 'Grand', 'Rare', 'Open', 'Eager', 'Keen', 'Fair',
  'Loyal', 'Serene', 'Vivid', 'Wild', 'Iron', 'Rustic', 'Arctic', 'Lunar', 'Solar', 'Silent',
  'Radiant', 'Mystic', 'Primal', 'Nimble', 'Valiant', 'Active', 'Agile', 'Ancient', 'Ardent', 'Balanced',
  // Strength & character
  'Blazing', 'Boundless', 'Centered', 'Cosmic', 'Crisp', 'Crystal', 'Daring', 'Dauntless', 'Devoted', 'Dynamic',
  'Earnest', 'Electric', 'Enduring', 'Epic', 'Eternal', 'Fearless', 'Fine', 'Firm', 'Focused', 'Forceful',
  'Fortunate', 'Frank', 'Gallant', 'Glowing', 'Graceful', 'Grounded', 'Hardy', 'Honest', 'Hopeful', 'Immortal',
  'Infinite', 'Lasting', 'Lofty', 'Magnetic', 'Majestic', 'Mighty', 'Mindful', 'Natural', 'Patient', 'Peaceful',
  'Persistent', 'Polished', 'Powerful', 'Precise', 'Prime', 'Ready', 'Regal', 'Resilient', 'Resolute', 'Righteous',
  // Virtue & nature
  'Robust', 'Sacred', 'Seasoned', 'Secure', 'Sincere', 'Skilled', 'Solemn', 'Sovereign', 'Sparkling', 'Spirited',
  'Stable', 'Stoic', 'Supreme', 'Thorough', 'Tireless', 'Tranquil', 'Trusted', 'Unbroken', 'Upright', 'Vast',
  'Vibrant', 'Vigilant', 'Virtuous', 'Worthy', 'Zealous', 'Rugged', 'Mellow', 'Sterling', 'Velvet', 'Flint',
  'Durable', 'Devoted', 'Timeless', 'Invincible', 'Unshaken', 'Undaunted', 'Unwavering', 'Tenacious', 'Indomitable', 'Relentless',
  // Colours & elements
  'Silver', 'Golden', 'Amber', 'Azure', 'Jade', 'Cobalt', 'Copper', 'Emerald', 'Ivory', 'Obsidian',
  'Opal', 'Pearl', 'Sapphire', 'Scarlet', 'Teal', 'Violet', 'Crimson', 'Verdant', 'Onyx', 'Indigo',
];

const NOUNS = [
  // Animals
  'Warrior', 'Hawk', 'Wolf', 'Bear', 'Fox', 'Eagle', 'Tiger', 'Falcon', 'Phoenix', 'Raven',
  'Lynx', 'Badger', 'Buck', 'Cobra', 'Condor', 'Coyote', 'Crane', 'Crow', 'Elk', 'Finch',
  'Heron', 'Jaguar', 'Jay', 'Kestrel', 'Lark', 'Lion', 'Monarch', 'Moose', 'Osprey', 'Otter',
  'Panda', 'Panther', 'Pelican', 'Puma', 'Robin', 'Salmon', 'Shark', 'Sparrow', 'Stag', 'Tortoise',
  'Trout', 'Viper', 'Wren', 'Bison', 'Mink', 'Narwhal', 'Pronghorn', 'Walrus', 'Zebra', 'Moth',
  // Landscape & water
  'Path', 'River', 'Mountain', 'Stone', 'Wave', 'Wind', 'Arrow', 'Creek', 'Trail', 'Peak',
  'Ridge', 'Valley', 'Shore', 'Tide', 'Gale', 'Cloud', 'Rain', 'Canyon', 'Forest', 'Harbor',
  'Island', 'Ocean', 'Summit', 'Horizon', 'Glacier', 'Blaze', 'Boulder', 'Brook', 'Cave', 'Cliff',
  'Crest', 'Current', 'Delta', 'Dune', 'Field', 'Grove', 'Gust', 'Hill', 'Lagoon', 'Lake',
  'Marsh', 'Mesa', 'Mist', 'Reef', 'Sand', 'Shadow', 'Shell', 'Slope', 'Snow', 'Stream',
  // Trees & plants
  'Oak', 'Cedar', 'Birch', 'Pine', 'Fir', 'Aspen', 'Juniper', 'Maple', 'Spruce', 'Sycamore',
  'Willow', 'Sequoia', 'Laurel', 'Fern', 'Leaf', 'Petal', 'Reed', 'Root', 'Sage', 'Thorn',
  // Fire, sky & cosmos
  'Storm', 'Ember', 'Star', 'Dawn', 'Dusk', 'Flame', 'Spark', 'Frost', 'Comet', 'Timber',
  'Talon', 'Shield', 'Lodge', 'Pillar', 'Tundra', 'Trek',
  // Archetypes & journey
  'Anchor', 'Beacon', 'Compass', 'Champion', 'Pioneer', 'Seeker', 'Sentinel', 'Vision', 'Voyager',
  'Nomad', 'Guide', 'Spire', 'Rover', 'Vanguard', 'Spirit', 'Haven', 'Forge', 'Quest', 'Hunter',
];

export function generateUsername(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

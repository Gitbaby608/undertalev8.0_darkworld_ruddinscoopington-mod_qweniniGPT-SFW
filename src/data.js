// Static game data: characters, news ticker, remote audio URLs.
export const NPCS = [
  ['👵', 'GRANDMA', ['MY CASSEROLE HAS +9000 DEFENCE!', 'BACK IN MY DAY, BOSSES HAD MANNERS!', 'I brought emergency biscuits!']],
  ['🦝', 'GREG', ['Your damage is tax deductible.', 'I lost the town budget in a poker game.', 'This boss owes me eleven dollars.']],
  ['🐦', 'KEVIN', ['CAW! THE RENT IS TOO HIGH!', 'I ate the quest objective.', 'THE CRUMB PROPHECY IS TRUE.']],
  ['🐈', 'LUNA', ['meow (translation: skill issue)', 'I am legally the mayor now.', 'I knocked over the boss potion.']],
  ['📫', 'DAVE', ['SPECIAL DELIVERY: ONE MILLION SPRINKLES!', 'Your boss fight needs more postage.', 'Package contains emotional support.']],
  ['🍦', 'SCOOP JR.', ['Vanilla is a lifestyle.', 'SPRINKLES SHALL RISE AGAIN!', 'My dad is a dessert criminal.']],
];

export const NEWS = [
  'LGBT History Month runs all October',
  'Oct 11 is National Coming Out Day',
  'Oct 15 is Spirit Day, a day of action against anti-LGBTQ+ bullying',
  'Nova Scotia’s first 2SLGBTQIA+ Action Plan and community grants roll out',
  'Canada’s Drag Race: All Stars debuts its inaugural season',
  'Canadian unions celebrate 2SLGBTQI+ workers in Pride solidarity campaigns',
  'Pride flag raised on Parliament Hill; federal safety funding announced',
  'Pride season events spanned Toronto, Hamilton, Windsor and beyond after the FIFA World Cup 2026 summer',
];

export const END_LINES = [
  'Grandma is doing scooter donuts.',
  'Greg has filed for emotional bankruptcy.',
  'Kevin the pigeon is now mayor.',
  'THE WAFFLE PROPHECY IS FULFILLED.',
];

// Remote-only audio (CORS may block some hosts; every entry is tried in order,
// silent WAV data-URI guarantees tryList always resolves).
export const BGM_SRC = [
  'https://myinstants.com/media/sounds/lildeucedeuce-beep-beep-im-a-sheep.mp3',
  'https://myinstants.com/media/sounds/beep-beep-im-a-sheep-remix.mp3',
  'https://myinstants.com/media/sounds/beep-ima-sheep-song.mp3',
];
// Remix first — the sheep honks the remix.
export const SHEEP_SRC = [
  'https://myinstants.com/media/sounds/beep-beep-im-a-sheep-remix.mp3',
  'https://myinstants.com/media/sounds/asdf-beep-beep-im-a-sheep.mp3',
  'https://myinstants.com/media/sounds/beep-ima-sheep-song.mp3',
];
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
BGM_SRC.push(SILENT_WAV);
SHEEP_SRC.push(SILENT_WAV);

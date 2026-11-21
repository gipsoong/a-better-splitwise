// Guess a friendly icon for an expense or group from its name. Purely cosmetic.
const RULES = [
  [/coffee|cafe|café|kopi|latte|starbucks|tea\b|boba|bubble tea/i, '☕', 30],
  [/beer|bar\b|drinks?|wine|alcohol|cocktail|pub|soju|club/i, '🍻', 40],
  [/grab|taxi|uber|gojek|cab|tada|ride|lyft|zig/i, '🚕', 48],
  [/flight|plane|air ?asia|airline|scoot|sia\b|airport|jetstar/i, '✈️', 205],
  [/hotel|airbnb|villa|hostel|resort|stay|accommodation|room|lodg/i, '🏨', 265],
  [/train|mrt|bus|metro|ferry|transport|ez-?link|subway/i, '🚆', 220],
  [/petrol|fuel|gas\b|parking|toll|erp|car rental|rental car/i, '⛽', 15],
  [/grocer|supermarket|ntuc|fairprice|cold storage|market|mart\b|7-?eleven/i, '🛒', 140],
  [/rent\b|house|home|flat|condo|apartment|hdb/i, '🏠', 190],
  [/electric|utilit|wifi|internet|water bill|phone bill|bill\b|sp group/i, '💡', 50],
  [/movie|cinema|concert|ticket|show|museum|theme park|zoo|universal/i, '🎟️', 290],
  [/shop|clothes|uniqlo|mall|zara|ikea/i, '🛍️', 320],
  [/gift|present|birthday|bday/i, '🎁', 340],
  [/dinner|lunch|breakfast|brunch|supper|food|meal|restaurant|\beat\b|bbq|hawker|pizza|sushi|ramen|hotpot|steak|burger|mcd|kfc|zi ?char|prata|chicken rice/i, '🍜', 25],
  [/trip|travel|holiday|vacation|bali|japan|tokyo|bangkok|korea|seoul|thai|europe|beach|island/i, '🌴', 160],
]

export function categorize(text) {
  for (const [re, icon, hue] of RULES) if (re.test(text || '')) return { icon, hue }
  return { icon: '🧾', hue: 170 }
}

const GROUP_FALLBACK = ['🎉', '🌈', '🪩', '🍀', '🔥', '⭐️', '🎈', '🧃']
export function groupIcon(name) {
  const c = categorize(name)
  if (c.icon !== '🧾') return c
  const n = [...(name || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return { icon: GROUP_FALLBACK[n % GROUP_FALLBACK.length], hue: (n * 47) % 360 }
}

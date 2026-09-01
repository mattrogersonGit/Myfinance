// MyKidsMoney — character system. Flat-geometric SVG shapes, no illustration
// assets; each slot is stored independently so options can grow later without
// a data migration.

const CHARACTER_SLOTS = [
  { id: 'body', label: 'Skin' },
  { id: 'hair', label: 'Hair' },
  { id: 'hat', label: 'Hat' },
  { id: 'top', label: 'Top' },
  { id: 'pants', label: 'Pants' },
  { id: 'shoes', label: 'Shoes' },
];

const CHARACTER_OPTIONS = {
  body: [
    { id: 'body-a', label: 'Light', swatch: '#F2C9A0' },
    { id: 'body-b', label: 'Tan', swatch: '#C9976B' },
    { id: 'body-c', label: 'Deep', swatch: '#8D5A3B' },
  ],
  hair: [
    { id: 'hair-brown', label: 'Brown', swatch: '#5B3A29' },
    { id: 'hair-black', label: 'Black', swatch: '#2B2B2B' },
    { id: 'hair-red', label: 'Red', swatch: '#B5502B' },
    { id: 'bald', label: 'None', swatch: '#DCE4D7' },
  ],
  hat: [
    { id: 'none', label: 'None', swatch: '#DCE4D7' },
    { id: 'cap-teal', label: 'Cap', swatch: '#2EC4C4' },
    { id: 'beanie-coral', label: 'Beanie', swatch: '#FF7A8A' },
  ],
  top: [
    { id: 'shirt-blue', label: 'Blue Shirt', swatch: '#4A90D9' },
    { id: 'hoodie-coral', label: 'Coral Hoodie', swatch: '#FF7A8A' },
    { id: 'tee-mint', label: 'Mint Tee', swatch: '#3FBF8F' },
  ],
  pants: [
    { id: 'jeans', label: 'Jeans', swatch: '#3B5273' },
    { id: 'shorts-navy', label: 'Shorts', swatch: '#16233D' },
  ],
  shoes: [
    { id: 'sneakers-white', label: 'Sneakers', swatch: '#FFFFFF' },
    { id: 'boots-brown', label: 'Boots', swatch: '#6B4A2F' },
  ],
};

const DEFAULT_CHARACTER = {
  body: 'body-a', hair: 'hair-brown', hat: 'none',
  top: 'shirt-blue', pants: 'jeans', shoes: 'sneakers-white',
};

function charOpt(slot, id) {
  return CHARACTER_OPTIONS[slot].find(o => o.id === id) || CHARACTER_OPTIONS[slot][0];
}

// One <svg>, layered back-to-front: shoes -> pants -> arms -> top -> head -> hair -> hat.
function renderCharacterSvg(character, sizePx) {
  const skin = charOpt('body', character.body).swatch;
  const hair = charOpt('hair', character.hair);
  const hat = charOpt('hat', character.hat);
  const top = charOpt('top', character.top).swatch;
  const pants = charOpt('pants', character.pants).swatch;
  const shoes = charOpt('shoes', character.shoes).swatch;

  const hairShape = hair.id === 'bald' ? '' :
    `<path d="M28,30 A22,23 0 0 1 72,30 L72,18 Q50,2 28,18 Z" fill="${hair.swatch}"/>`;
  const hatShape = hat.id === 'none' ? '' : `
    <rect x="24" y="2" width="52" height="16" rx="8" fill="${hat.swatch}"/>
    <rect x="20" y="14" width="60" height="6" rx="3" fill="${hat.swatch}"/>`;

  return `<svg viewBox="0 0 100 140" width="${sizePx}" height="${sizePx}" aria-hidden="true">
    <rect x="30" y="118" width="16" height="12" rx="5" fill="${shoes}"/>
    <rect x="54" y="118" width="16" height="12" rx="5" fill="${shoes}"/>
    <rect x="32" y="88" width="36" height="34" rx="10" fill="${pants}"/>
    <rect x="18" y="52" width="12" height="30" rx="6" fill="${skin}"/>
    <rect x="70" y="52" width="12" height="30" rx="6" fill="${skin}"/>
    <rect x="28" y="48" width="44" height="42" rx="14" fill="${top}"/>
    <circle cx="50" cy="28" r="20" fill="${skin}"/>
    ${hairShape}
    ${hatShape}
  </svg>`;
}

export const TREE_CARD_WIDTH = 232;
export const TREE_CARD_HEIGHT = 112;
export const SIBLING_GAP = 40;
export const PARTNER_GAP = 24;

export const cardCenter = (position) => ({
  x: position.x + (position.width || TREE_CARD_WIDTH) / 2,
  y: position.y + (position.height || TREE_CARD_HEIGHT) / 2,
});

// Railways are two tiles wide: every piece of track fills a 2 x 2 block of tiles lined up on a grid of even
// coordinates. Rail code keeps using tile indices, always the top-left tile of a block (its "origin"), and steps
// RS tiles at a time from block to block.
import { DX, DY } from './util';
import { W } from './terrain';

export const RS = 2;
/** round a tile coordinate down onto the rail grid */
export const snapR = (v: number) => v - (((v % RS) + RS) % RS);
/** the rail block (origin tile index) containing tile (x, y) */
export const rOrigin = (x: number, y: number) => snapR(y) * W + snapR(x);
/** the neighbouring rail block through side s */
export const rStep = (i: number, s: number) => i + (DY[s] * W + DX[s]) * RS;
/** the middle of a rail block, in tile units */
export const rcx = (i: number) => i % W + RS / 2, rcy = (i: number) => Math.floor(i / W) + RS / 2;
/** the four tiles of a rail block */
export const rTiles = (i: number) => [i, i + 1, i + W, i + W + 1];

// Sentinel markers injected into AI streams to delimit thinking blocks.
// A NULL-byte prefix ensures no collision with normal text content.
export const THINK_START = '\x00\x01';
export const THINK_END   = '\x00\x02';

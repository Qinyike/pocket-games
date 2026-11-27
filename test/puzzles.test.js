import assert from 'node:assert/strict';
import test from 'node:test';
import { minefield, openArea } from '../src/games/mines.js';
import { makeCircuit, powered, turn } from '../src/games/circuit.js';

function generator(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('minefield makes the first square and all its neighbors safe', () => {
  for (const [size, count] of [[9,10],[12,22],[16,42]]) {
    for (const first of [0, Math.floor(size*size/2), size*size-1]) {
      const board = minefield(size,count,first,generator(first+1));
      assert.equal(board.mines.size,count);
      assert.equal(board.numbers[first],0);
      assert.equal(board.mines.has(first),false);
      const revealed = new Set();
      const flagged = (first % size === size-1) ? first-1 : first+1;
      openArea(first,size,board,revealed,new Set([flagged]));
      assert(revealed.has(first));
      assert(!revealed.has(flagged));
      assert([...revealed].every(index=>!board.mines.has(index)));
    }
  }
});

test('random circuit games begin scrambled and can always be restored by rotations', () => {
  for (const size of [5,7,9]) {
    for (let seed = 0; seed < 36; seed += 1) {
      const { board, source, solution } = makeCircuit(size,generator(seed));
      assert(powered(board,size,source).size < size*size);
      assert.equal(powered(solution,size,source).size,size*size);
      board.forEach((mask,index)=>assert([mask,turn(mask),turn(turn(mask)),turn(turn(turn(mask)))].includes(solution[index])));
    }
  }
});

test('a cannon captures across one screen, a horse needs a free leg, and generals cannot face', async () => {
  const { xiangqiBoard, xiangqiMove, inCheck } = await import('../src/games/xiangqi.js');
  const board = xiangqiBoard();
  assert(xiangqiMove(board,64,1));
  assert.equal(xiangqiMove(board,82,75),null);
  assert(xiangqiMove(board,82,63));
  for (const cell of [31,58]) board[cell]=null;
  assert.equal(inCheck(board,0),true);
  assert.equal(inCheck(board,1),true);
});

test('military chess deployment and capture rules', async () => {
  const { junqiBoard, junqiMove } = await import('../src/games/junqi.js');
  const deployed = junqiBoard(generator(12));
  for (const side of [0,1]) {
    const pieces=deployed.filter(piece=>piece?.side===side);
    assert.equal(pieces.length,25);
    assert.equal(pieces.filter(piece=>piece.type==='M').length,3);
    const flag = deployed.findIndex(piece=>piece?.side===side && piece.type==='F');
    assert((side===0?[56,58]:[1,3]).includes(flag));
  }
  const board = Array(60).fill(null);
  board[25]={side:0,type:'1'};
  board[32]={side:1,type:'M'};
  assert.equal(junqiMove(board,25,32)?.[32],board[25]);
  board[25]={side:0,type:'9'};
  assert.equal(junqiMove(board,25,32),null);
  board[30]={side:1,type:'B'};
  assert.equal(junqiMove(board,25,30)?.[30],null);
});

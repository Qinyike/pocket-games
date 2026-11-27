import assert from 'node:assert/strict';
import { test } from 'node:test';
import { xiangqiBoard, xiangqiMove, xiangqiComputer, xiangqiAdjudicate, inCheck } from '../src/games/xiangqi.js';
import { junqiBoard, junqiMove, junqiComputer, swapDeployment } from '../src/games/junqi.js';

test('xiangqi computer replies with a legal move and responds to a check', () => {
  const board=xiangqiMove(xiangqiBoard(),54,45);
  const reply=xiangqiComputer(board,1);
  assert.equal(board[reply[0]].side,1);
  assert(xiangqiMove(board,...reply));
  const check=Array(90).fill(null);
  check[4]={side:1,type:'K'};
  check[85]={side:0,type:'K'};
  check[31]={side:0,type:'R'};
  assert(inCheck(check,1));
  const escape=xiangqiComputer(check,1);
  assert(escape);
  assert.equal(inCheck(xiangqiMove(check,...escape),1),false);
});

test('xiangqi adjudicates no-capture and perpetual-check cycles', () => {
  const board=xiangqiBoard();
  const history=Array.from({length:120},(_,i)=>({key:String(i),check:false}));
  assert.equal(xiangqiAdjudicate(board,0,history).winner,2);
  assert.equal(xiangqiAdjudicate(board,0,history,true).winner,null);
  const check=Array(90).fill(null);
  check[4]={side:1,type:'K'};check[85]={side:0,type:'K'};check[31]={side:0,type:'R'};
  const current=xiangqiAdjudicate(check,1,[]).trail[0];
  const trail=[current,{key:'reply',check:false},current,{key:'reply',check:false},current,{key:'reply',check:false}];
  assert.equal(xiangqiAdjudicate(check,1,trail).winner,1);
});

test('junqi computer does not consult the ranks of hidden opposing pieces', () => {
  const board=junqiBoard(()=>.39);
  const swapped=board.map(piece=>piece?.side===0&&['2','3'].includes(piece.type)
    ?{...piece,type:piece.type==='2'?'3':'2'}:piece);
  assert.notDeepEqual(swapped,board);
  const reply=junqiComputer(board,1);
  assert.deepEqual(junqiComputer(swapped,1),reply);
  assert(junqiMove(board,...reply));
});

test('junqi guards camps, only lets engineers turn on rails, and restricts deployment', () => {
  const board=Array(60).fill(null);
  board[25]={side:1,type:'1'};
  assert(junqiMove(board,25,34));
  board[25]={side:1,type:'2'};
  assert.equal(junqiMove(board,25,34),null);
  assert.equal(junqiMove(board,25,31),null);
  board[5]={side:1,type:'7'};board[6]={side:0,type:'2'};
  assert.equal(junqiMove(board,5,6),null);
  board[51]={side:0,type:'B'};board[56]={side:1,type:'F'};
  assert.equal(junqiMove(board,51,56)?.[56],null);
  const army=junqiBoard(()=>.38);
  const flag=army.findIndex(piece=>piece?.side===0&&piece.type==='F');
  assert.equal(swapDeployment(army,0,flag,55),null);
  assert(swapDeployment(army,0,flag,flag===56?58:56));
});

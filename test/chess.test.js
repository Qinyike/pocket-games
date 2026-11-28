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


test('junqi flip shuffles 50 hidden pieces and determines colors per player', async () => {
  const {createFlipMatch,revealFlip}=await import('../src/games/junqi-flip.js');
  const state=createFlipMatch(()=>.37);
  assert.equal(state.board.filter(Boolean).length,50);
  assert.equal(state.board.filter(piece=>piece?.side===0).length,25);
  assert.equal(state.shown.length,0);
  const red=state.board.flatMap((piece,index)=>piece?.side===0?[index]:[]);
  const blue=state.board.findIndex(piece=>piece?.side===1);
  assert(revealFlip(state,red[0]));
  assert(revealFlip(state,blue));
  assert.deepEqual(state.colors,[null,null]);
  assert(revealFlip(state,red[1]));
  assert.deepEqual(state.colors,[0,1]);
  assert.equal(state.side,1);
  assert.equal(revealFlip(state,red[1]),false);
});

test('junqi flip requires a revealed target and clearing mines before taking the flag', async () => {
  const {createFlipMatch,flipMove,playFlip}=await import('../src/games/junqi-flip.js');
  const state=createFlipMatch();
  state.board=Array(60).fill(null);
  state.board[25]={side:0,type:'1'};
  state.board[30]={side:1,type:'M'};
  state.board[31]={side:1,type:'F'};
  state.shown=[25,31];
  state.colors=[0,1];
  state.mines=[0,1];
  assert.equal(playFlip(state,25,30),false);
  state.shown.push(30);
  const flagGuard=state.board.slice();
  flagGuard[30]=flagGuard[25];
  assert.equal(flipMove(flagGuard,30,31,0,[0,1]),null);
  assert(flipMove(flagGuard,30,31,0,[0,0]));
  assert(playFlip(state,25,30));
  assert.equal(state.mines[1],0);
  assert.equal(state.board[30].type,'1');
  assert.equal(state.winner,0);
  const board=Array(60).fill(null);
  board[19]={side:0,type:'2'};
  board[24]={side:1,type:'7'};
  assert.equal(flipMove(board,19,24,0,[0,0]),null);
  board[19]={side:0,type:'9'};
  assert(flipMove(board,19,24,0,[0,0]));
});

test('junqi flip computer sees the locations but not the ranks of face-down pieces', async () => {
  const {createFlipMatch,flipComputer}=await import('../src/games/junqi-flip.js');
  const state=createFlipMatch(()=>.37);
  const other={...state,board:state.board.map(piece=>piece&&{side:1-piece.side,type:piece.type})};
  for(const mode of ['easy','normal','hard']) {
    const turn=flipComputer(state,mode,()=>.51);
    assert.deepEqual(turn,flipComputer(other,mode,()=>.51));
    assert(state.board[turn.flip]);
  }
});

import { load, save } from '../engine.js';
import { puzzleGrid } from './puzzle-grid.js';

const sideName = side=>side===0?'红方':'黑方';

export function mountDuel(api,rules) {
  const key=rules.id+':match';
  const stored=load(key,null);
  const valid=stored?.board?.length===rules.rows*rules.cols && [0,1].includes(stored.side);
  let board=valid?stored.board:rules.initial();
  let side=valid?stored.side:0;
  let count=valid?stored.count:0;
  let winner=valid?stored.winner:null;
  let selected=-1;
  let concealed=Boolean(rules.secret && winner===null);
  const cells=puzzleGrid(api.stage,rules.cols,rules.label,choose,null,rules.rows);
  const grid=cells[0].parentElement;
  grid.classList.add('duel-grid');

  function persist() { save(key,{board,side,count,winner}); }
  function restart() {
    board=rules.initial();
    side=0;
    count=0;
    winner=null;
    selected=-1;
    concealed=Boolean(rules.secret);
    persist();
    api.hideOverlay();
    renderAndPrompt();
  }

  function choose(index) {
    if (concealed || winner!==null) return;
    const piece=board[index];
    if (piece?.side===side) {
      selected=selected===index?-1:index;
      render();
      return;
    }
    if (selected<0) return;
    const next=rules.move(board,selected,index);
    if (!next) {
      api.message('这一步不能走');
      return;
    }
    board=next;
    selected=-1;
    count+=1;
    side=1-side;
    winner=rules.winner(board,side);
    concealed=Boolean(rules.secret && winner===null);
    persist();
    api.play(winner===null?'move':'clear');
    renderAndPrompt();
  }

  function renderAndPrompt() {
    render();
    if (concealed) {
      api.overlay(`交给${sideName(side)}`,'确认对手看不到屏幕后再开始。',[['开始回合',()=>{
        concealed=false;
        api.hideOverlay();
        render();
      }]]);
    } else if (winner!==null) {
      api.overlay(sideName(winner)+'获胜',`本局 ${count} 手`,[['再来一局',restart],['查看棋盘',api.hideOverlay]]);
    }
  }

  function render() {
    api.hud(['回合',winner===null?sideName(side):sideName(winner)+'获胜'],['手数',count]);
    api.message(concealed?'换手时隐藏军棋棋面':winner===null?rules.status(board,side):'本局结束');
    cells.forEach((cell,index)=>{
      const piece=board[index];
      const show=piece && !concealed;
      const visible=show && (!rules.secret || piece.side===side || winner!==null);
      const title=visible?rules.name(piece):show?'暗棋':'';
      cell.dataset.selected=String(index===selected);
      cell.dataset.tile=rules.tile(board,index);
      cell.dataset.piece=show?String(piece.side):'';
      if (show) {
        const token=document.createElement('span');
        token.textContent=visible?title:'◆';
        cell.replaceChildren(token);
      } else cell.textContent='';
      const position=`第 ${Math.floor(index/rules.cols)+1} 行第 ${index%rules.cols+1} 列`;
      cell.setAttribute('aria-label',position+(title?'，'+title:''));
    });
  }

  api.restart(restart);
  persist();
  renderAndPrompt();
}

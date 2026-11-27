import { load, save } from '../engine.js';
import { puzzleGrid } from './puzzle-grid.js';

const sideName = side=>side===0?'红方':'黑方';

export function mountDuel(api,rules) {
  // Existing local matches keep their original storage key.
  let mode='ai', board, side, count, winner, recent, exposed, trail, outcome;
  let deploying=null;
  let selected=-1, concealed=false, computerTimer;
  const key=()=>rules.id+(mode==='ai'?':ai-match':':match');
  const cells=puzzleGrid(api.stage,rules.cols,rules.label,choose,null,rules.rows);
  const grid=cells[0].parentElement;
  grid.classList.add('duel-grid');
  grid.insertAdjacentHTML('afterbegin',`<svg class="duel-diagram" viewBox="0 0 ${rules.cols} ${rules.rows}" preserveAspectRatio="none" aria-hidden="true">${rules.diagram()}</svg>`);
  const deployment=rules.rearrange && document.createElement('button');
  if(deployment) {
    deployment.type='button';
    deployment.className='quiet duel-deploy';
    api.stage.after(deployment);
    deployment.onclick=deploymentAction;
  }
  api.select('对局',[['ai','人机'],['local','双人']],value=>{mode=value;openMatch();});

  function persist() { save(key(),{board,side,count,winner,recent,exposed,trail,outcome}); }
  function waitingForComputer() { return mode==='ai' && side===1 && winner===null; }

  function openMatch(restart=false) {
    clearTimeout(computerTimer);
    const stored=restart?null:load(key(),null);
    const valid=stored?.board?.length===rules.rows*rules.cols && [0,1].includes(stored.side);
    board=valid?stored.board:rules.initial();
    side=valid?stored.side:0;
    count=valid?stored.count:0;
    winner=valid?stored.winner:null;
    recent=valid&&Array.isArray(stored.recent)?stored.recent:[];
    exposed=valid&&Array.isArray(stored.exposed)?stored.exposed:[];
    trail=valid&&Array.isArray(stored.trail)?stored.trail:rules.adjudicate?.(board,side,[]).trail??[];
    outcome=valid?stored.outcome??'':'';
    deploying=null;
    selected=-1;
    concealed=Boolean(mode==='local' && rules.secret && winner===null);
    persist();
    api.hideOverlay();
    renderAndPrompt();
  }

  function restart() { openMatch(true); }

  function deploymentAction() {
    if(count!==0||winner!==null||concealed) return;
    selected=-1;
    if(deploying===null) deploying=0;
    else if(deploying===0&&mode==='local') {
      deploying=1;
      concealed=true;
      render();
      api.overlay('交给黑方布阵','红方阵型已经隐藏。',[['开始布阵',()=>{
        concealed=false;api.hideOverlay();render();
      }]]);
      return;
    } else {
      deploying=null;
      concealed=mode==='local';
      renderAndPrompt();
      return;
    }
    render();
  }

  function choose(index) {
    if (concealed || winner!==null || waitingForComputer()) return;
    const piece=board[index];
    if(deploying!==null) {
      if(piece?.side!==deploying) return;
      if(selected===-1||selected===index) selected=selected===index?-1:index;
      else {
        const next=rules.rearrange(board,deploying,selected,index);
        if(!next) {api.message('这个位置不符合布阵规则');return;}
        board=next;
        selected=-1;
        persist();
      }
      render();
      return;
    }
    if (piece?.side===side) {
      selected=selected===index?-1:index;
      render();
      return;
    }
    if (selected<0) return;
    if (!move(selected,index)) api.message('这一步不能走');
  }

  function move(from,to) {
    const next=rules.move(board,from,to);
    if(!next) return false;
    const captured=Boolean(board[to]);
    if(rules.secret) {
      const known=exposed.includes(from)||(captured&&Boolean(next[to]));
      exposed=exposed.filter(index=>index!==from&&index!==to);
      if(known) exposed.push(to);
    }
    recent.push({side,from,to,survived:next[to]?.side===side});
    if(recent.length>12) recent.shift();
    board=next;
    selected=-1;
    count+=1;
    side=1-side;
    winner=rules.winner(board,side);
    if(winner!==null) outcome=rules.endReason?.(board,side)??'';
    const ruling=rules.adjudicate?.(board,side,trail,captured);
    if(ruling) {
      trail=ruling.trail;
      if(winner===null&&ruling.winner!==null) {winner=ruling.winner;outcome=ruling.reason;}
    }
    concealed=Boolean(mode==='local' && rules.secret && winner===null);
    persist();
    api.play(winner===null?'move':'clear');
    renderAndPrompt();
    return true;
  }

  const resultText = () => winner===2?'和棋':sideName(winner)+'获胜';

  function renderAndPrompt() {
    render();
    if (concealed) {
      api.overlay(`交给${sideName(side)}`,'确认对手看不到屏幕后再开始。',[['开始回合',()=>{
        concealed=false;
        api.hideOverlay();
        render();
      }]]);
    } else if (winner!==null) {
      api.overlay(resultText(),outcome||`本局 ${count} 手`,[['再来一局',restart],['查看棋盘',api.hideOverlay]]);
    } else if(waitingForComputer()) {
      computerTimer=setTimeout(()=>{
        const reply=rules.computer(board,side,recent,exposed);
        if(reply && move(...reply)) return;
        winner=1-side;
        persist();
        renderAndPrompt();
      },240);
    }
  }

  function render() {
    const visibleSide=deploying??(mode==='ai'?0:side);
    api.hud(['回合',winner===null?sideName(deploying??side):resultText()],['手数',count]);
    api.message(concealed?'换手时隐藏军棋棋面':deploying!==null?'点两枚己方棋子交换位置。军旗留在大本营，地雷只能在后两排，炸弹不能在前线。':winner!==null?outcome||'本局结束':waitingForComputer()?'电脑正在思考…':rules.status(board,side));
    if(deployment) {
      deployment.hidden=count!==0||winner!==null||concealed;
      deployment.textContent=deploying===null?'调整布阵':'确认阵型';
    }
    const allowed=selected>=0&&deploying===null&&!waitingForComputer();

    cells.forEach((cell,index)=>{
      const piece=board[index];
      const show=piece && !concealed;
      const visible=show && (!rules.secret || piece.side===visibleSide || winner!==null || exposed.includes(index) || rules.publicRank(board,index));
      const title=visible?rules.name(piece):show?'暗棋':'';
      cell.dataset.selected=String(index===selected);
      cell.dataset.legal=String(allowed&&Boolean(rules.move(board,selected,index)));
      cell.dataset.tile=rules.tile(board,index);
      cell.dataset.piece=show?String(piece.side):'';
      cell.setAttribute('aria-disabled',String(concealed || winner!==null || waitingForComputer()));
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
  api.signal.addEventListener('abort',()=>clearTimeout(computerTimer),{once:true});
  openMatch();
}

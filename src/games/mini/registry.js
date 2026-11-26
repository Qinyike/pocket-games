import { Game2048 } from './g2048/game.js';
import { SnakeGame } from './snake/game.js';
import { MinesweeperUI } from './minesweeper/game.js';
import { BreakoutGame } from './breakout/game.js';
import { GomokuGame } from './gomoku/game.js';
import { ReversiGame } from './reversi/game.js';
import { SudokuGame } from './sudoku/game.js';

export const MINI_ORDER = ['2048', 'snake', 'minesweeper', 'breakout', 'gomoku', 'reversi', 'sudoku'];

const constructors = {
  '2048': Game2048,
  snake: SnakeGame,
  minesweeper: MinesweeperUI,
  breakout: BreakoutGame,
  gomoku: GomokuGame,
  reversi: ReversiGame,
  sudoku: SudokuGame,
};

export const MINI_GAMES = {
  '2048': {
    title: '2048',
    subtitle: '合并数字，挑战 2048',
    track: 'puzzle',
    realTime: false,
  },
  snake: {
    title: '贪吃蛇',
    subtitle: '吃果实，越长越难',
    track: 'action',
    realTime: true,
  },
  minesweeper: {
    title: '扫雷',
    subtitle: '首击安全，排掉所有雷',
    track: 'puzzle',
    realTime: false,
  },
  breakout: {
    title: '打砖块',
    subtitle: '三关砖墙，一颗球',
    track: 'action',
    realTime: true,
  },
  gomoku: {
    title: '五子棋',
    subtitle: '你执黑，五子连珠获胜',
    track: 'puzzle',
    realTime: false,
  },
  reversi: {
    title: '黑白棋',
    subtitle: '夹住对方，翻转棋子',
    track: 'puzzle',
    realTime: false,
  },
  sudoku: {
    title: '数独',
    subtitle: '唯一解 · 笔记 · 提示',
    track: 'puzzle',
    realTime: false,
  },
};

export function createMiniGame(key, context) {
  const Meta = constructors[key];
  return Meta ? new Meta(context) : null;
}

export function isMiniGame(key) {
  return Boolean(MINI_GAMES[key]);
}

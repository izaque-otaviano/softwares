import * as mock from './mock/board';
import * as real from './real/board';
import { IS_REAL } from './mode';

// Fachada: escolhe a implementação por VITE_API_MODE. As telas importam sempre daqui.
const impl: Omit<typeof mock, 'resetBoardMock'> = IS_REAL ? real : mock;

export const { listBoards, getBoard, placeCard, setCardDue, setWipLimit, createBoard, renameBoard, deleteBoard, createLane, renameLane, reorderLanes, deleteLane } = impl;

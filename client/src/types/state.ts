import type { SkeletonState } from '@/engine/types';

export type SetStateWithHistory = (actionId: string, updater: (prev: SkeletonState) => SkeletonState) => void;

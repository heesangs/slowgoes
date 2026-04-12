-- v1 task 시스템 정리: difficulty_adjustments 테이블 삭제
-- tasks/subtasks 테이블은 유지 (데이터 보존, 추후 별도 정리)

DROP TABLE IF EXISTS public.difficulty_adjustments CASCADE;

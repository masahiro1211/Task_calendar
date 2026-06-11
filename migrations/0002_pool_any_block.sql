-- 「配置済み」の定義を「未来のブロックを持つ」から「ブロックを1つでも持つ」に変更。
-- 置いた予定が過去になってもプールには戻さない(やり直しはブロック自体を動かす)。
create or replace view v_pool as
select l.*
from v_leaves l
where l.is_leaf
  and l.state = 'open'
  and l.size <> 'L'
  and not exists (
    select 1 from blocks b
    where b.task_id = l.id
  )
order by l.effective_deadline nulls last, l.size, l.sort_order;

-- N8 报关放行已退出业务流：N7 通过后进入 N9 收汇。
-- 只把仍停在 N8 的案件改到 N9。不删除节点行、报关历史或演示数据。
UPDATE "TradeCase" SET "currentNode" = 'N9' WHERE "currentNode" = 'N8';

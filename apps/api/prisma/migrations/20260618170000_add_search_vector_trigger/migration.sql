-- 1. 创建全文搜索向量自动更新函数
-- 从 title + content 生成 tsvector，使用 'simple' 配置（支持中英文分词）
CREATE OR REPLACE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.content, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 创建触发器：文章 INSERT 或 UPDATE 时自动计算 search_vector
CREATE TRIGGER trg_articles_search_vector
  BEFORE INSERT OR UPDATE OF title, content ON articles
  FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();

-- 3. 回填已有文章的 search_vector（一次性）
UPDATE articles SET search_vector =
  setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(content, '')), 'B');

-- 4. 为 search_vector 创建 GIN 索引（加速全文搜索查询）
CREATE INDEX IF NOT EXISTS articles_search_vector_idx ON articles USING GIN (search_vector);

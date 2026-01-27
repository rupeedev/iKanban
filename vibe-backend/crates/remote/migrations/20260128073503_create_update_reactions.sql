-- Create update_reactions table for Pulse emoji reactions
-- IKA-338: Pulse - reactions on project updates

CREATE TABLE IF NOT EXISTS update_reactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    update_id   UUID NOT NULL REFERENCES project_updates(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One reaction type per user per update
    UNIQUE(update_id, user_id, emoji)
);

-- Primary query: Count reactions per update
-- Covers: SELECT emoji, COUNT(*) FROM update_reactions WHERE update_id = ? GROUP BY emoji
CREATE INDEX idx_update_reactions_update
    ON update_reactions(update_id);

-- For user's reactions (check if already reacted)
CREATE INDEX idx_update_reactions_update_user
    ON update_reactions(update_id, user_id);

-- For "Popular" sorting: count reactions in time window
CREATE INDEX idx_update_reactions_created
    ON update_reactions(created_at DESC);

COMMENT ON TABLE update_reactions IS 'Emoji reactions on project updates';
COMMENT ON COLUMN update_reactions.emoji IS 'Emoji identifier: thumbs_up, heart, prayer_hands, etc.';

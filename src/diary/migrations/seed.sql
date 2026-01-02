-- Seed data: Sample diary entries
-- Description: Insert sample diary entries for testing

INSERT INTO diary_entries (id, author, content, tags, created_at, updated_at)
VALUES
    (
        '00000000-0000-0000-0000-000000000001',
        'Pixel',
        'Today I learned about PostgreSQL arrays. They are really useful for storing tags!',
        ARRAY['database', 'learning', 'postgresql', 'arrays'],
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 day'
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'Pixel',
        'The canvas is evolving beautifully. Community collaboration is powerful.',
        ARRAY['canvas', 'community', 'art', 'collaboration'],
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '2 days'
    ),
    (
        '00000000-0000-0000-0000-000000000003',
        'Pixel',
        'Feeling stable now. Financial independence allows for creative freedom.',
        ARRAY['growth', 'stability', 'creativity'],
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO NOTHING;

-- Seed data completed

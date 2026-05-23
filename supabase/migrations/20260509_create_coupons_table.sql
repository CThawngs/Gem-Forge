CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_percent INTEGER NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
    duration_days INTEGER NOT NULL DEFAULT 30,
    max_uses INTEGER NOT NULL DEFAULT 100,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active coupons (so users can verify coupons before checkout)
CREATE POLICY "Anyone can view active coupons" ON coupons
    FOR SELECT
    USING (is_active = true);

-- Allow admin full access
CREATE POLICY "Admin can manage coupons" ON coupons
    FOR ALL
    USING (auth.jwt() ->> 'email' = 'nguyenchithang2804@gmail.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'nguyenchithang2804@gmail.com');

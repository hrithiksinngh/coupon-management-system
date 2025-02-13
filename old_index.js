const express = require('express');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON requests
app.use(express.json());
app.use(bodyParser.json());

// Initialize Supabase client using environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
    const adminEmail = req.headers.emailid;

    if (!adminEmail) {
        return res.status(401).json({
            statusCode: 401,
            message: 'Access Denied',
            error: 'Unauthorized'
        });
    }

    try {
        const { data, error } = await supabase
            .from('admin')
            .select('email')
            .eq('email', adminEmail)
            .single();

        if (error || !data) {
            return res.status(401).json({
                statusCode: 401,
                message: 'Access Denied',
                error: 'Unauthorized'
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            statusCode: 500,
            message: 'Error checking admin authorization',
            error: error.message
        });
    }
};

// CRUD APIs for Coupons

// Create a Coupon
app.post('/admin/api/coupons/createCoupon', authenticateAdmin, async (req, res) => {
    const {
        code,
        offer_name,
        discount_type,
        discount_value,
        max_usage,
        max_usage_per_user,
        start_date,
        end_date,
        terms_url,
        coupon_description
    } = req.body;

    try {
        // Convert empty strings to null or appropriate default values
        const couponData = {
            code,
            offer_name,
            discount_type,
            discount_value: Number(discount_value),
            max_usage: max_usage === '' ? null : Number(max_usage),
            max_usage_per_user: max_usage_per_user === '' ? null : Number(max_usage_per_user),
            // Convert milliseconds timestamp to proper date format
            start_date: new Date(parseInt(start_date)).toISOString(),
            end_date: new Date(parseInt(end_date)).toISOString(),
            terms_url: terms_url,
            coupon_description: coupon_description
        };

        const { data, error } = await supabase.from('coupons').insert(couponData);

        if (error) throw error;

        res.status(200).json({
            statusCode: 200,
            message: 'Coupon created successfully',
            data: data,
            error: null
        });
    } catch (error) {
        console.error('Coupon creation error:', error);
        res.status(500).json({
            statusCode: 500,
            message: 'Error creating coupon',
            error: error.message,
            data: null
        });
    }
});

// Get All Coupons
app.get('/admin/api/coupons/getAllCoupons', authenticateAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase.from('coupons').select('*');

        if (error) throw error;

        res.status(200).json({
            statusCode: 200,
            message: 'Coupons fetched successfully',
            data: data,
            error: null
        });
    } catch (error) {
        res.status(500).json({
            statusCode: 500,
            message: 'Error fetching coupons',
            error: error.message,
            data: null
        });
    }
});

// Get a Single Coupon
app.get('/admin/api/coupons/getCouponById/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase.from('coupons').select('*').eq('id', id).single();

        if (error) throw error;

        res.status(200).json({
            statusCode: 200,
            message: 'Coupon fetched successfully',
            data: data,
            error: null
        });
    } catch (error) {
        res.status(404).json({
            statusCode: 404,
            message: 'Coupon not found',
            error: error.message,
            data: null
        });
    }
});

// Update a Coupon
app.put('/admin/api/coupons/update/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;
    const updates = { ...req.body };

    try {
        // Convert date timestamps to ISO string if they exist in updates
        if (updates.start_date) {
            updates.start_date = new Date(parseInt(updates.start_date)).toISOString();
        }
        if (updates.end_date) {
            updates.end_date = new Date(parseInt(updates.end_date)).toISOString();
        }

        // Convert numeric fields if they exist
        if (updates.discount_value) {
            updates.discount_value = Number(updates.discount_value);
        }
        if (updates.max_usage) {
            updates.max_usage = updates.max_usage === '' ? null : Number(updates.max_usage);
        }
        if (updates.max_usage_per_user) {
            updates.max_usage_per_user = updates.max_usage_per_user === '' ? null : Number(updates.max_usage_per_user);
        }

        const { data, error } = await supabase.from('coupons').update(updates).eq('id', id);

        if (error) throw error;

        res.status(200).json({
            statusCode: 200,
            message: 'Coupon updated successfully',
            data: data,
            error: null
        });
    } catch (error) {
        res.status(500).json({
            statusCode: 500,
            message: 'Error updating coupon',
            error: error.message,
            data: null
        });
    }
});

// Hard Delete a Coupon
app.delete('/admin/api/coupons/hard-delete/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase.from('coupons').delete().eq('id', id);

        if (error) throw error;

        res.status(200).json({
            statusCode: 200,
            message: 'Coupon deleted successfully',
            error: null,
            data: null
        });
    } catch (error) {
        res.status(500).json({
            statusCode: 500,
            message: 'Error deleting coupon',
            error: error.message,
            data: null
        });
    }
});

// Soft Delete a Coupon
app.delete('/admin/api/coupons/soft-delete/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('coupons')
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        if (data && data.length === 0) {
            return res.status(404).json({
                statusCode: 404,
                message: 'Coupon not found or already deleted',
                error: 'Not Found',
                data: null
            });
        }

        res.status(200).json({
            statusCode: 200,
            message: 'Coupon soft-deleted successfully',
            error: null,
            data: null
        });
    } catch (error) {
        res.status(500).json({
            statusCode: 500,
            message: 'Error soft-deleting coupon',
            error: error.message,
            data: null
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
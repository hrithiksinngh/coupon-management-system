const express = require('express');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

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
const JWT_SECRET = process.env.JWT_SECRET;
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to verify token
const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { valid: true, expired: false, decoded };
    } catch (err) {
        return { valid: false, expired: err.name === 'TokenExpiredError', decoded: null };
    }
};

// Middleware to authenticate admin
const authenticateAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; // Extract token from "Bearer <token>"

    if (!token) {
        return res.status(401).json({ message: "Access Denied: No Token Provided" });
    }

    const result = verifyToken(token);

    if (!result.valid) {
        return res.status(401).json({
            message: result.expired ? "Token Expired. Please log in again." : "Invalid Token"
        });
    }

    console.log("Decoded Token:", result.decoded);

    if (!result.decoded.adminId || !result.decoded.adminEmail) {
        return res.status(401).json({
            message: "Invalid Token: Missing required fields"
        });
    }

    req.admin = result.decoded; // Attach decoded data to request
    next();
};

// Admin Login Route
app.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Fetch admin details
        const { data, error } = await supabase
            .from('admin')
            .select('id, email,password')
            .eq('email', email)
            .single();



        if (error || !data) {
            return res.status(401).json({
                statusCode: 401,
                message: 'Access Denied, Admin Email not found',
                error: 'Unauthorized'
            });
        }

        console.log('Admin Data:', data);

        // Check if password matches (you should hash and compare passwords securely in production)
        if (data.password !== password) {
            return res.status(401).json({
                statusCode: 401,
                message: 'Invalid Credentials , password does not match',
                error: 'Unauthorized'
            });
        }

        // Create token payload
        const payload = {
            adminId: data.id,
            adminEmail: data.email,
            isAdmin: true
        };

        // Generate JWT token
        const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({
            statusCode: 200,
            message: 'Login successful',
            email: data.email,
            accessToken
        });
    } catch (err) {
        res.status(500).json({
            statusCode: 500,
            message: 'Internal server error',
            error: err.message
        });
    }
});

// Create a Coupon
app.post('/admin/api/coupons/createCoupon',authenticateAdmin, async (req, res) => {
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
app.get('/admin/api/coupons/getAllCoupons',authenticateAdmin, async (req, res) => {
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
app.get('/admin/api/coupons/getCouponById/:id',authenticateAdmin, async (req, res) => {
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
app.put('/admin/api/coupons/update/:id',authenticateAdmin, async (req, res) => {
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
app.delete('/admin/api/coupons/delete/:id',authenticateAdmin, async (req, res) => {
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


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
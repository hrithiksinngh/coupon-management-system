const express = require('express');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// Load environment variables from .env file
dotenv.config();



// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for parsing JSON requests
app.use(express.json());
app.use(bodyParser.json());
// Enable CORS for all origins
app.use(cors());

// OR, for more fine-grained control:
// app.use(cors({
//     origin: '*', // Allows all origins
//     methods: 'GET,POST,PUT,DELETE,OPTIONS',
//     allowedHeaders: 'Content-Type,Authorization'
// }));

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
app.post('/api/admin/login', async (req, res) => {
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
                status: 401,
                message: 'Access Denied, Admin Email not found',
                error: 'Unauthorized'
            });
        }

        console.log('Admin Data:', data);

        // Check if password matches (you should hash and compare passwords securely in production)
        if (data.password !== password) {
            return res.status(401).json({
                status: 401,
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
            status: 200,
            message: 'Login successful',
            email: data.email,
            accessToken
        });
    } catch (err) {
        res.status(500).json({
            status: 500,
            message: 'Internal server error',
            error: err.message
        });
    }
});

// Create a Coupon
app.post('/api/admin/coupons/createCoupon', authenticateAdmin, async (req, res) => {
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
        // Check if coupon code already exists and is active
        const { data: existingCoupon, error: checkError } = await supabase
            .from('coupons')
            .select('*')
            .eq('code', code)
            .eq('is_deleted', false)
            .single();

        if (existingCoupon) {
            // Check if existing coupon is still active
            const currentDate = new Date().getTime();
            const couponEndDate = new Date(existingCoupon.end_date).getTime();
            
            if (currentDate <= couponEndDate) {
                return res.status(400).json({
                    status: 400,
                    message: 'Coupon code already exists and is active',
                    error: 'Duplicate coupon code',
                    data: null
                });
            }
        }

        // Convert empty strings to null or appropriate default values
        const couponData = {
            code,
            offer_name,
            discount_type,
            discount_value: Number(discount_value),
            max_usage: max_usage === '' ? null : Number(max_usage),
            max_usage_per_user: max_usage_per_user === '' ? null : Number(max_usage_per_user),
            start_date: new Date(parseInt(start_date)).toISOString(),
            end_date: new Date(parseInt(end_date)).toISOString(),
            terms_url: terms_url,
            coupon_description: coupon_description
        };

        const { data, error } = await supabase.from('coupons').insert(couponData);

        if (error) throw error;

        res.status(200).json({
            status: 200,
            message: 'Coupon created successfully',
            data: data,
            error: null
        });
    } catch (error) {
        console.error('Coupon creation error:', error);
        res.status(500).json({
            status: 500,
            message: 'Error creating coupon',
            error: error.message,
            data: null
        });
    }
});

// Get All Coupons
app.get('/api/admin/coupons/getAllCoupons',authenticateAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase.from('coupons').select('*');

        if (error) throw error;

        console.log('Coupons:', data);

        res.status(200).json({
            status: 200,
            message: 'Coupons fetched successfully',
            data: data,
            error: null
        });
    } catch (error) {
        res.status(500).json({
            status: 500,
            message: 'Error fetching coupons',
            error: error.message,
            data: null
        });
    }
});

// Get a Single Coupon
app.get('/api/admin/coupons/getCouponById/:id',authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase.from('coupons').select('*').eq('id', id).single();

        if (error) throw error;

        res.status(200).json({
            status: 200,
            message: 'Coupon fetched successfully',
            data: data,
            error: null
        });
    } catch (error) {
        res.status(404).json({
            status: 404,
            message: 'Coupon not found',
            error: error.message,
            data: null
        });
    }
});

// Update a Coupon
app.put('/api/admin/coupons/update/:id',authenticateAdmin, async (req, res) => {
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
            status: 200,
            message: 'Coupon updated successfully',
            data: data,
            error: null
        });
    } catch (error) {
        res.status(500).json({
            status: 500,
            message: 'Error updating coupon',
            error: error.message,
            data: null
        });
    }
});

// Hard Delete a Coupon
app.delete('/api/admin/coupons/hard-delete/:id', authenticateAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const { error } = await supabase.from('coupons').delete().eq('id', id);

        if (error) throw error;

        res.status(200).json({
            status: 200,
            message: 'Coupon deleted successfully',
            error: null,
            data: null
        });
    } catch (error) {
        res.status(500).json({
            status: 500,
            message: 'Error deleting coupon',
            error: error.message,
            data: null
        });
    }
});

// Soft Delete a Coupon
app.delete('/api/admin/coupons/soft-delete/:id', authenticateAdmin, async (req, res) => {
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
                status: 404,
                message: 'Coupon not found or already deleted',
                error: 'Not Found',
                data: null
            });
        }

        res.status(200).json({
            status: 200,
            message: 'Coupon soft-deleted successfully',
            error: null,
            data: null
        });
    } catch (error) {
        res.status(500).json({
            status: 500,
            message: 'Error soft-deleting coupon',
            error: error.message,
            data: null
        });
    }
});

// Validate Coupon
app.post('/api/coupons/validate', async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1]; // Extract token from "Bearer <token>"

    if (!token) {
        return res.status(401).json({
            status: 401,
            message: "Access Denied: No Token Provided",
            error: "Unauthorized",
            data: null
        });
    }

    const result = verifyToken(token);

    // TODO: uncomment this after integration of user table

    // if (!result.valid) {
    //     return res.status(401).json({
    //         status: 401,
    //         message: result.expired ? "Token Expired. Please log in again." : "Invalid Token",
    //         error: "Unauthorized",
    //         data: null
    //     });
    // }

    const { coupon_code } = req.body;
    // const email = result.decoded.email; // Keep this line to get email from token
    const email = req.headers.email;

    if (!coupon_code) {
        return res.status(400).json({
            status: 400,
            message: 'Coupon code is required',
            error: 'Bad Request',
            data: null
        });
    }

    try {
        // First check if coupon exists and is valid
        const { data: couponData, error: couponError } = await supabase
            .from('coupons')
            .select('*')
            .eq('code', coupon_code)
            .eq('is_deleted', false)
            .single();

        if (couponError || !couponData) {
            return res.status(404).json({
                status: 404,
                message: 'Invalid coupon code',
                error: 'Coupon not found',
                data: null
            });
        }

        // Check if coupon is expired
        const currentDate = new Date().getTime();
        const startDate = new Date(couponData.start_date).getTime();
        const endDate = new Date(couponData.end_date).getTime();

        if (currentDate < startDate || currentDate > endDate) {
            return res.status(400).json({
                status: 400,
                message: 'Coupon has expired',
                error: 'Invalid date range',
                data: null
            });
        }

        // Check if user exists
        try {
            console.log('Attempting to find user with email:', email);
            
            const { data: userData, error: userError } = await supabase
                .from('user')
                .select('email, coupon_codes_used, is_coupon_report_free')
                .eq('email', email.toLowerCase())
                .single();

            console.log('Query result:', { userData, userError });

            if (userError || !userData) {
                return res.status(404).json({
                    status: 404,
                    message: 'User not found',
                    error: 'Invalid email',
                    data: null
                });
            }

            // Check if it's a REPORT type coupon and if user has already used their free report
            if (couponData.discount_type === 'REPORT' && !userData.is_coupon_report_free) {
                return res.status(400).json({
                    status: 400,
                    message: 'Free report coupon already used',
                    error: 'Coupon not applicable',
                    data: null
                });
            }

            // Check if user has already used this coupon
            const usedCoupons = userData.coupon_codes_used ? userData.coupon_codes_used.split(',') : [];
            
            // Count how many times this user has used this coupon
            const userCouponUsageCount = usedCoupons.filter(code => code === coupon_code).length;
            
            // Check if user has exceeded their per-user limit
            if (couponData.max_usage_per_user !== null && userCouponUsageCount >= couponData.max_usage_per_user) {
                return res.status(400).json({
                    status: 400,
                    message: 'Maximum usage limit per user exceeded for this coupon',
                    error: 'Coupon not applicable',
                    data: null
                });
            }

            // If all validations pass, return coupon details
            res.status(200).json({
                status: 200,
                message: 'Coupon is valid',
                error: null,
                data: {
                    discount_type: couponData.discount_type,
                    discount_value: couponData.discount_value,
                    coupon_description: couponData.coupon_description
                }
            });

        } catch (error) {
            console.error('Coupon validation error:', error);
            res.status(500).json({
                status: 500,
                message: 'Error validating coupon',
                error: error.message,
                data: null
            });
        }

    } catch (error) {
        console.error('Coupon validation error:', error);
        res.status(500).json({
            status: 500,
            message: 'Error validating coupon',
            error: error.message,
            data: null
        });
    }
});

// Log Coupon Usage
app.post('/api/coupons/log-usage', async (req, res) => {
    const { 
        discount_applied,
        user_email,
        coupon_id,
        transaction_status
    } = req.body;

    try {
        // Validate required fields
        if (!discount_applied || !user_email || !coupon_id || !transaction_status) {
            return res.status(400).json({
                status: 400,
                message: 'Missing required fields',
                error: 'Bad Request',
                data: null
            });
        }

        // First get coupon details to check type
        const { data: couponData, error: couponError } = await supabase
            .from('coupons')
            .select('code, discount_type')
            .eq('id', coupon_id)
            .single();

        if (couponError || !couponData) {
            return res.status(404).json({
                status: 404,
                message: 'Coupon not found',
                error: 'Invalid coupon ID',
                data: null
            });
        }

        // Start a transaction
        const { data: userData, error: userError } = await supabase
            .from('user')
            .select('coupon_codes_used')
            .eq('email', user_email.toLowerCase())
            .single();

        if (userError || !userData) {
            return res.status(404).json({
                status: 404,
                message: 'User not found',
                error: 'Invalid email',
                data: null
            });
        }

        // Create usage log
        const { error: usageError } = await supabase
            .from('coupon_usages')
            .insert({
                discount_applied,
                user_email: user_email.toLowerCase(),
                coupon_id,
                applied_at: new Date().toISOString(),
                transaction_status
            });

        if (usageError) throw usageError;

        // Update user's coupon usage
        const currentCoupons = userData.coupon_codes_used || '';
        const updatedCoupons = currentCoupons 
            ? `${currentCoupons},${couponData.code}`
            : couponData.code;

        const updates = {
            coupon_codes_used: updatedCoupons
        };

        // If it's a REPORT type coupon, update is_coupon_report_free
        if (couponData.discount_type === 'REPORT') {
            updates.is_coupon_report_free = false;
        }

        const { error: updateError } = await supabase
            .from('user')
            .update(updates)
            .eq('email', user_email.toLowerCase());

        if (updateError) throw updateError;

        res.status(200).json({
            status: 200,
            message: 'Coupon usage logged successfully',
            error: null,
            data: {
                coupon_code: couponData.code,
                user_email,
                transaction_status
            }
        });

    } catch (error) {
        console.error('Error logging coupon usage:', error);
        res.status(500).json({
            status: 500,
            message: 'Error logging coupon usage',
            error: error.message,
            data: null
        });
    }
});

// Fetch Coupon Usage Logs
app.get('/api/admin/coupons/logs', authenticateAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('coupon_usages')
            .select(`
                id,
                discount_applied,
                user_email,
                applied_at,
                transaction_status,
                coupons (
                    code,
                    coupon_description,
                    discount_type,
                    discount_value
                )
            `)
            .order('applied_at', { ascending: false });

        if (error) throw error;

        // Format the response data
        const formattedLogs = data.map(log => ({
            id: log.id,
            coupon_code: log.coupons.code,
            coupon_description: log.coupons.coupon_description,
            discount_type: log.coupons.discount_type,
            discount_value: log.coupons.discount_value,
            discount_applied: log.discount_applied,
            user_email: log.user_email,
            applied_at: log.applied_at,
            transaction_status: log.transaction_status
        }));

        res.status(200).json({
            status: 200,
            message: 'Coupon logs fetched successfully',
            error: null,
            data: formattedLogs
        });

    } catch (error) {
        console.error('Error fetching coupon logs:', error);
        res.status(500).json({
            status: 500,
            message: 'Error fetching coupon logs',
            error: error.message,
            data: null
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
const { supabaseAdmin } = require('../config/supabaseClient');

async function findBestVolunteer(ngoId) {
    try {
        const { data: volunteer, error } = await supabaseAdmin
            .from('volunteers')
            .select('volunteer_id, full_name, phone, vehicle_type')
            .eq('ngo_id', ngoId)
            .eq('availability_status', true)
            .limit(1)
            .single();

        if (error) {
            if (error.code !== 'PGRST116') { 
                console.error('[VolunteerService] Error finding volunteer:', error);
            }
            return null;
        }

        return volunteer;
    } catch (err) {
        console.error('[VolunteerService] Unexpected error:', err);
        return null;
    }
}

module.exports = {
    findBestVolunteer
};
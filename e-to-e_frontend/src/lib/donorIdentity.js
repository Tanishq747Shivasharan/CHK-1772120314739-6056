const first = (value) => Array.isArray(value) ? value[0] : value

function usableName(value) {
    if (typeof value !== 'string') return ''
    const name = value.trim()
    if (!name || ['-', '—', '–', 'unknown', 'unknown donor', 'donor', 'n/a', 'null'].includes(name.toLowerCase())) return ''
    return name
}

export function getDonorDisplayName(source, fallback = '—') {
    if (!source || typeof source !== 'object') return fallback
    const donor = first(source.donors) || first(source.donor) || source.donors || source.donor || {}
    const profile = first(donor.profiles) || first(source.profiles) || donor.profiles || source.profiles || {}
    const name = [
        profile.organization_name,
        donor.organization_name,
        source.organization_name,
        profile.full_name,
        donor.full_name,
        source.full_name,
        source.donor_name,
        source.name,
    ].map(usableName).find(Boolean)

    return name || fallback
}

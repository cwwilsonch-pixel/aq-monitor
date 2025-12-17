import ldap from 'ldapjs';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/configManager.js';
export async function authenticateLdap(username, password) {
    const config = getConfig();
    const ldapConfig = config.auth?.ldap;
    if (!ldapConfig || !ldapConfig.enabled) {
        throw new Error('LDAP authentication is not enabled');
    }
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({
            url: ldapConfig.url,
            timeout: 5000,
            connectTimeout: 5000
        });
        // First, bind with admin credentials to search for the user
        client.bind(ldapConfig.bindDN, ldapConfig.bindPassword, (bindErr) => {
            if (bindErr) {
                logger.error({ err: bindErr.message }, 'LDAP admin bind failed');
                client.unbind();
                return reject(new Error('LDAP authentication failed'));
            }
            // Search for the user and their groups
            const searchFilter = ldapConfig.searchFilter.replace('{{username}}', username);
            // Explicitly request memberOf and other needed attributes for Global Catalog
            const opts = {
                filter: searchFilter,
                scope: 'sub',
                attributes: ['dn', 'cn', 'sAMAccountName', 'memberOf']
            };
            logger.info({ searchFilter, searchBase: ldapConfig.searchBase, attributes: opts.attributes }, 'LDAP search starting');
            client.search(ldapConfig.searchBase, opts, (searchErr, searchRes) => {
                if (searchErr) {
                    logger.error({ err: searchErr.message }, 'LDAP search failed');
                    client.unbind();
                    return reject(new Error('LDAP authentication failed'));
                }
                let userDN = null;
                let userGroups = [];
                searchRes.on('searchEntry', (entry) => {
                    userDN = entry.objectName || entry.dn.toString();
                    // Log all attributes returned from LDAP - convert buffers to strings
                    logger.info({
                        userDN,
                        attributeTypes: entry.attributes.map(a => a.type)
                    }, 'LDAP user entry found');
                    // Extract group memberships
                    if (ldapConfig.groupAttribute) {
                        const groupAttr = entry.attributes.find(attr => attr.type.toLowerCase() === ldapConfig.groupAttribute.toLowerCase());
                        // Group attribute found, processing values
                        // Try different ways to get the values
                        const values = groupAttr?._vals || groupAttr?.vals || groupAttr?.values;
                        if (values && Array.isArray(values) && values.length > 0) {
                            userGroups = values.map((dn) => {
                                // Convert buffer to string if needed
                                const dnString = Buffer.isBuffer(dn) ? dn.toString('utf8') : String(dn);
                                // Extract CN from group DN (e.g., "CN=itsdbm_arbor,OU=Mail_DL,OU=_Resources,DC=swi,DC=srse,DC=net")
                                const match = dnString.match(/CN=([^,]+)/i);
                                return match ? match[1] : dnString;
                            });
                            logger.debug({ username, userGroups }, 'LDAP groups extracted from user');
                        }
                        else {
                            logger.warn({
                                username,
                                groupAttribute: ldapConfig.groupAttribute,
                                availableAttributes: entry.attributes.map(a => a.type),
                                groupAttrFound: !!groupAttr,
                                hasValues: !!(groupAttr?.values),
                                hasVals: !!(groupAttr?.vals)
                            }, 'LDAP group attribute not found or empty');
                        }
                    }
                });
                searchRes.on('error', (err) => {
                    logger.error({ err: err.message }, 'LDAP search error');
                    client.unbind();
                    reject(new Error('LDAP authentication failed'));
                });
                searchRes.on('end', () => {
                    client.unbind();
                    if (!userDN) {
                        logger.warn({ username }, 'LDAP user not found');
                        return resolve({ authenticated: false });
                    }
                    // Check if user is in allowed groups
                    const allowedGroups = ldapConfig.allowedGroups || [];
                    const hasRequiredGroup = allowedGroups.length === 0 ||
                        userGroups.some(group => allowedGroups.some(allowed => group.toLowerCase().includes(allowed.toLowerCase())));
                    if (!hasRequiredGroup) {
                        logger.warn({ username, userGroups, allowedGroups }, 'User not in allowed LDAP groups');
                        return resolve({ authenticated: false, groups: userGroups });
                    }
                    // Now try to bind with the user's credentials
                    const userClient = ldap.createClient({
                        url: ldapConfig.url,
                        timeout: 5000,
                        connectTimeout: 5000
                    });
                    userClient.bind(userDN, password, (userBindErr) => {
                        userClient.unbind();
                        if (userBindErr) {
                            logger.warn({ username, err: userBindErr.message }, 'LDAP user bind failed');
                            return resolve({ authenticated: false });
                        }
                        logger.info({ username, groups: userGroups }, 'LDAP authentication successful');
                        resolve({ authenticated: true, groups: userGroups, userDN });
                    });
                });
            });
        });
        // Handle connection errors
        client.on('error', (err) => {
            logger.error({ err: err.message }, 'LDAP connection error');
            reject(new Error('LDAP authentication failed'));
        });
    });
}

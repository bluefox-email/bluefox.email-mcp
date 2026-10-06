// Appended to every email body description - models otherwise guess generic tags like {{name}}, which render empty
// because contact data only exists nested under `contact` in the template context.
export const CONTACT_MERGE_TAGS = 'Contact merge tags MUST be prefixed with "contact." - use {{contact.name}}, {{contact.email}}, or {{contact.<customFieldName>}} (custom field names from manage_contact_fields_and_tags). Never use bare {{name}}, {{firstName}} or {{email}} for contact data - they render as empty strings. For a greeting fallback use the DEFAULT helper, e.g. "Hi {{DEFAULT contact.name "there"}},".'

// Campaign-only: the web version page re-renders the campaign on demand, so it is not a snapshot of what was sent.
export const WEB_VERSION_MERGE_TAG = 'Campaigns can also use {{webVersionLink}}, a "view in browser" link to the recipient\'s personalized copy. It only works once the campaign is sent or archived, and always shows the latest version of the campaign - edits made after sending are visible to people who already received it. Tell the user this when adding the link or editing a sent campaign that contains it.'

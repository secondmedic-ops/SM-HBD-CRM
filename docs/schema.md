# Database schema (generated from supabase/migrations - do not edit)

## accounts_logins
| column | type | nullable |
|---|---|---|
| email | text | NO |
| added_by | uuid | YES |
| created_at | timestamp with time zone | NO |

## attachments
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| mime | text | NO |
| data | text | NO |
| bytes | integer | NO |
| created_by | uuid | YES |
| created_at | timestamp with time zone | NO |

## audit_log
| column | type | nullable |
|---|---|---|
| id | bigint | NO |
| at | timestamp with time zone | NO |
| user_id | uuid | YES |
| action | text | NO |
| table_name | text | NO |
| row_id | text | YES |
| before | jsonb | YES |
| after | jsonb | YES |

## client_visits
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| client_id | uuid | NO |
| staff_id | uuid | NO |
| visit_date | date | NO |
| kind | text | NO |
| purpose | text | NO |
| notes | text | NO |
| next_follow_up | date | YES |
| created_by | uuid | YES |
| created_at | timestamp with time zone | NO |
| updated_at | timestamp with time zone | NO |

## clients
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| name | text | NO |
| type | text | NO |
| category | text | NO |
| contact_person | text | NO |
| phone | text | YES |
| email | text | YES |
| address | text | NO |
| city | text | NO |
| pincode | text | YES |
| status | text | NO |
| notes | text | NO |
| staff_id | uuid | NO |
| dept | text | NO |
| created_by | uuid | YES |
| created_at | timestamp with time zone | NO |
| updated_at | timestamp with time zone | NO |

## daily_updates
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| update_date | date | NO |
| staff_id | uuid | NO |
| dept | text | NO |
| update_text | text | NO |
| clients_met | integer | NO |
| created_by | uuid | YES |
| created_at | timestamp with time zone | NO |

## departments
| column | type | nullable |
|---|---|---|
| name | text | NO |
| target | numeric | NO |
| sort_order | integer | NO |
| updated_at | timestamp with time zone | NO |

## deployments
| column | type | nullable |
|---|---|---|
| id | bigint | NO |
| at | timestamp with time zone | NO |
| sha | text | NO |
| subject | text | YES |
| author | text | YES |
| areas | text | YES |
| status | text | NO |
| run_url | text | YES |

## outstanding_payments
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| revenue_entry_id | uuid | YES |
| client | text | NO |
| staff_id | uuid | NO |
| dept | text | NO |
| amount | numeric | NO |
| amount_paid | numeric | NO |
| due_date | date | NO |
| screenshot_id | uuid | YES |
| created_by | uuid | YES |
| created_at | timestamp with time zone | NO |
| updated_at | timestamp with time zone | NO |

## revenue_entries
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| entry_date | date | NO |
| staff_id | uuid | NO |
| dept | text | NO |
| client | text | NO |
| type | text | NO |
| amount | numeric | NO |
| cost | numeric | NO |
| is_new_client | boolean | NO |
| amount_received | numeric | NO |
| due_date | date | YES |
| slip_id | uuid | YES |
| created_by | uuid | YES |
| created_at | timestamp with time zone | NO |
| updated_at | timestamp with time zone | NO |
| client_id | uuid | YES |

## staff
| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| name | text | NO |
| dept | text | NO |
| role | text | NO |
| designation | text | NO |
| project | text | NO |
| individual_target | numeric | NO |
| email | text | YES |
| active | boolean | NO |
| created_at | timestamp with time zone | NO |
| updated_at | timestamp with time zone | NO |
| incharge_id | uuid | YES |

## user_roles
| column | type | nullable |
|---|---|---|
| user_id | uuid | NO |
| role | text | NO |
| created_at | timestamp with time zone | NO |

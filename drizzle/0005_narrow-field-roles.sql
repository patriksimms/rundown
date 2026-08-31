-- Roles narrow to dimension and metric. Date and ID fields keep their nature in
-- semantic_type, so their stored role migrates to dimension.
UPDATE `fields` SET `role` = 'dimension' WHERE `role` IN ('date', 'id');
--> statement-breakpoint
UPDATE `calculated_fields` SET `role` = 'dimension' WHERE `role` IN ('date', 'id');

-- Roles narrow to dimension and metric. Date and ID fields keep their nature in
-- semantic_type, so their stored role migrates to dimension.
--
-- Role and semantic type were independently editable, so a field could carry
-- role 'date' with some other semantic type. The role was its only date marker,
-- and date-field selection now reads the semantic type, so carry that over
-- before the role is dropped. Role 'id' needs no equivalent: those rows stay
-- dimensions either way, which is all anything asked of them.
UPDATE `fields` SET `semantic_type` = 'date' WHERE `role` = 'date' AND `semantic_type` <> 'date';
--> statement-breakpoint
UPDATE `calculated_fields` SET `semantic_type` = 'date' WHERE `role` = 'date' AND `semantic_type` <> 'date';
--> statement-breakpoint
UPDATE `fields` SET `role` = 'dimension' WHERE `role` IN ('date', 'id');
--> statement-breakpoint
UPDATE `calculated_fields` SET `role` = 'dimension' WHERE `role` IN ('date', 'id');

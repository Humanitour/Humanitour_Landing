-- Champs Openforms ecartes au back-office.
--
-- Migration ADDITIVE : une colonne a valeur par defaut vide, aucune donnee
-- existante touchee. Sans champ ecarte, la reprise du questionnaire se comporte
-- exactement comme avant.

ALTER TABLE "Survey" ADD COLUMN "openformsIgnoredKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

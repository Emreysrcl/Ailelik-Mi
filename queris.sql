
-- Bu SQL içeriği, aşağıdaki sütunlara sahip 'profil' adlı bir tablo oluşturur:
CREATE TABLE profil (
id SERIAL PRIMARY KEY,
username VARCHAR(255),
password VARCHAR(255),
name VARCHAR(255),
surname  VARCHAR(255),
age INT,
tel VARCHAR(25),
country VARCHAR(255),
profilimg VARCHAR DEFAULT 'defaultprofil.jpeg'
)




-- Bu SQL içeriği, aşağıdaki sütunlara sahip 'savedfilm' adlı bir tablo oluşturur:
CREATE TABLE savedfilm (
id SERIAL PRIMARY KEY,
user_id INT REFERENCES profil(id) ON DELETE CASCADE,
name  VARCHAR(255) NOT NULL, 
isFamilyFriendly VARCHAR(255) NOT NULL,
familyFriendlyRating INT  NOT NULL ,
contentType VARCHAR(255) NOT NULL,
genre TEXT NOT NULL,
platform TEXT NOT NULL,
summary TEXT NOT NULL,
mainActors TEXT NOT NULL,
director TEXT NOT NULL,
duration TEXT NOT NULL,
videoLink 	TEXT NOT NULL,
languageSpecificRecommendations  TEXT NOT NULL ,
searchTermImage TEXT NOT NULL
)

-- Bu SQL içeriği, aşağıdaki sütunlara sahip 'comment' adlı bir tablo oluşturur:
CREATE TABLE comment(
id SERIAL PRIMARY KEY,
filmname TEXT NOT NULL,
user_id INT REFERENCES profil(id) ON DELETE CASCADE,
username VARCHAR(255) NOT NULL,
comment TEXT NOT NULL,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
)
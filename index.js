import express from 'express'; 
import session from 'express-session';
import dotenv from 'dotenv';
import pg from 'pg';
import bodyParser from 'body-parser';
import multer from 'multer';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import moment from 'moment'

dotenv.config();

const app = express();
const port = 3000;

const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

db.connect()
    .then(() => console.log("Connected to database"))
    .catch((err) => console.error("Database connection error:", err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static("public"));


app.use('/profil', express.static('profil'));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');


const createDirectories = () => {
    const directories = ['profil'];
    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    });
};
createDirectories();


const genAI = new GoogleGenerativeAI(process.env.GEMINE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });



 app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
})); 

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'profil/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const uploadProfile = multer({ storage: profileStorage });
const defaultImage = 'defaultprofil.jpeg';


app.get('/', (req, res) => {
    res.render('index.ejs');
});



app.get('/login-register', (req, res) => {
    const message = req.session.message || null;
    delete req.session.message;
    res.render('login-register.ejs' , { message });
});

app.post('/login', async (req, res) => {

    const { username, password } = req.body;
    try{
        const result = await db.query('SELECT * FROM profil WHERE username = $1 AND password = $2', [username, password]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            req.session.user = {
                id: user.id,
                name: user.name,
                usersurname: user.surname,
                userage: user.age,
                usertel: user.tel,
                usercountry: user.country,
                profilimg: user.profilimg
            };
            console.log('Login successful');
             req.session.message = {
                type: 'success',
                content: 'Giriş başarılı!'
        };
            res.redirect('/home');
        } else {
            req.session.message = {
            type: 'danger',
            content: 'Kullanıcı adı veya şifre hatalı!'
        };
            console.log('Login failed' + req.session.message);
            res.redirect("/login-register");
            
        }
    }
    catch(err){
        console.error('Database error:', err);
        const message = 'An unexpected error occurred';
        res.render("index.ejs", { message });
    }

});

app.post('/register'  ,uploadProfile.single('profilimg'), async (req, res) => {
    const { username, password, name, surname, age, tel, country } = req.body;
    const imagePath = req.file ? req.file.filename : defaultImage;

    try {
        const checkResult = await db.query('SELECT * FROM profil WHERE username = $1', [username]);
        if (checkResult.rows.length > 0) {

           req.session.message = {
            type: 'danger',
            content: 'E-posta zaten kayıtlı başka bir E-posta deneyin!'
        };

            console.log('Registration failed: Username already exists');
            res.redirect('/login-register');
        } else {
            const result = await db.query(
                'INSERT INTO profil (username, password, name, surname, age, tel, country ,profilimg) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
                [username, password, name, surname, age, tel, country, imagePath]
            );
            req.session.user = { id: result.rows[0].id, name, surname, age, tel, country, profilimg: imagePath };
            console.log('Registration successful');
            res.redirect('/home');
        }
    } catch (err) {
        console.error('Database error:', err);
         req.session.message = {
            type: 'danger',
            content: 'Database Error!'
        };
        console.log('Registration failed:Database error');
        res.redirect("/login-register");
    }
});

app.get('/home',async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login-register');
    }
    const message = req.session.message || null;
    delete req.session.message;
    const user = req.session.user;
    const profilimg = await db.query('SELECT profilimg FROM profil WHERE id = $1', [user.id]);
    console.log("Profil resmi:", profilimg);
    res.render('anasayfa.ejs', { user: req.session.user, profilimg: profilimg, message });
});

async function isValidImage(url) {
    try {
        const response = await fetch(url, { method: "HEAD" }); 
        return response.ok && response.headers.get("content-type").startsWith("image/");
    } catch (error) {
        console.error("Image validation error:", error);
        return false;
    }
}

async function getFilmImage(filmName) {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;
    const query = encodeURIComponent(filmName + " film poster"); 
    const url = `https://www.googleapis.com/customsearch/v1?q=${query}&cx=${cx}&searchType=image&key=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
            const imageUrl = data.items[0].link;
            return imageUrl;
        } else {
            console.warn("Görsel bulunamadı:", data);
        }
    } catch (error) {
        console.error("Google Image API Error:", error);
    }

    return "/assets/a.png"; 
}




function formatDate(date) {
  return moment(date).fromNow(); 
} 

app.post('/search', async (req, res) => { 
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }

    const searchTerm = req.body.searchTerm;
    if (!searchTerm) {
        return res.status(400).send("Lütfen geçerli bir içerik giriniz.");
    }
    try {
        const prompt = `
        Kullanıcının izleyeceği içerik (dizi, film, belgesel vb.) "${searchTerm}" hakkında:
        
        1. Bu içerik aile ile izlenebilir mi? Lütfen EVET veya HAYIR olarak cevap ver. Cevap verirken içeriğin içerisinde cinsellik, vahşet ve aileye uygunsuz davranışlar olup olmadığını değerlendir.
        2. İçeriğin aile ile izlenebilirlik durumunu 0 ve 10 arasında bir puanla değerlendir (0 = aile ile izlenemez, 10 = aile ile izlenebilir, ara rakamlarda ise ortalama değerlendir).
        3. İçeriğin türünü belirt (film, dizi, belgesel vb.).
        4. İçeriğin ana türünü belirt (örneğin: komedi, dram, aksiyon, belgesel vb.).
        5. İçeriğin hangi platformda izlenebileceğini belirt (Netflix, Disney+, Amazon Prime, YouTube vb.).
        6. İçeriğin konusu hakkında kısa bir özet ver.
        7. İçeriğin başrol oyuncularını ve yönetmenini belirt.
        8. İçeriğin izlenme süresini belirt (örneğin: 2 saat, 45 dakika vb.).
        9. İçeriğe uygun fragman veya video araması yap ve YouTube veya web üzerindeki video linkini ver.
        10. Eğer içerik Türkçe arandıysa, Türkçe açıklama ve öneriler ver; yabancı dilde arama yapılmışsa, diline göre içerik önerileri sun.
        
        Çıktıyı JSON formatında ver ve anahtar isimlerini şu şekilde tut:
        {
            "isFamilyFriendly": "",            // "EVET" veya "HAYIR"
            "familyFriendlyRating": 0,         // Aile ile izlenebilirlik puanı (0-10 arasında)
            "contentType": "",                 // Film, dizi, belgesel vb.
            "genre": "",                       // İçeriğin türü (komedi, dram, aksiyon, vb.)
            "platform": "",                    // İçeriğin izlenebileceği platform (Netflix, YouTube, vb.)
            "summary": "",                     // İçeriğin kısa özeti
            "mainActors": [],                  // Başrol oyuncuları
            "director": "",                    // Yönetmen
            "duration": "",                    // İzlenme süresi (örneğin: 2 saat, 45 dakika vb.)
            "videoLink": "",                   // Fragman veya video linki
            "languageSpecificRecommendations": "" // Türkçe ise Türkçe öneriler, yabancı dilde ise yabancı dil önerileri
        }
        `;

        const result = await model.generateContent(prompt);

        
        if (result.response && result.response.text) {
            const responseText = result.response.text();
            console.log("AI Response Text:", responseText);

          
            let cleanResponse = responseText.replace(/```[a-z]*\n/, "").replace(/```/, "").trim();

          
            let jsonResult;
            try {
                jsonResult = JSON.parse(cleanResponse);
            } catch (jsonError) {
                console.error("JSON Parsing Hatası:", jsonError);
                  req.session.message = {
                    type: 'danger',
                    content: 'İçerik hakkında bilgi bulunamadı ya da işlem sırasında bir hata oldu tekrar deneyiniz!'
                    };
                console.log("AI Yanıtı:", cleanResponse);
                res.redirect('/home');
            }

            const comments = await db.query('SELECT * FROM comment WHERE filmname = $1', [searchTerm]);
            
            console.log("Yorumlar:", comments.rows);
            if (comments.rows.length === 0) {
                console.log('Bu film için yorum bulunamadı.');
            }
            const comment = comments.rows;

            console.log("Parsed JSON Response:", jsonResult);
            const searchTermImage = await getFilmImage(searchTerm);
            
            console.log("Film Görseli URL:", searchTermImage);

            res.render('searchresult.ejs', { user, searchTerm, result: jsonResult, searchTermImage, comment ,formatDate });
        } else {
            console.error("Yanıt içeriği beklenenden farklı:", result);
            return res.status(500).send("Beklenmeyen yanıt yapısı.");
        }

    } catch (err) {
        console.error('Hata:', err);
        res.status(500).send("Bir hata oluştu.");
    }
});

app.post('/save', async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }

    const {
        searchTerm,
        isFamilyFriendly,
        familyFriendlyRating,
        contentType,
        genre,
        platform,
        summary,
        mainActors,
        director,
        duration,
        videoLink,
        languageSpecificRecommendations,
        searchTermImage
    } = req.body;

    console.log("Gelen veriler:", req.body);

    try {
        const result = await db.query(
            `INSERT INTO savedfilm 
                (user_id, name, isFamilyFriendly, familyFriendlyRating, contentType, genre, platform, summary, mainActors, director, duration, videoLink, languageSpecificRecommendations, searchTermImage)
             VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             ON CONFLICT (user_id, name) 
             DO UPDATE SET
                isfamilyfriendly = EXCLUDED.isfamilyfriendly,
                familyfriendlyRating = EXCLUDED.familyfriendlyRating,
                contentType = EXCLUDED.contentType,
                genre = EXCLUDED.genre,
                platform = EXCLUDED.platform,
                summary = EXCLUDED.summary,
                mainActors = EXCLUDED.mainActors,
                director = EXCLUDED.director,
                duration = EXCLUDED.duration,
                videoLink = EXCLUDED.videoLink,
                languageSpecificRecommendations = EXCLUDED.languageSpecificRecommendations,
                searchTermImage = EXCLUDED.searchTermImage`
            , [
                user.id,
                searchTerm,
                isFamilyFriendly,
                familyFriendlyRating,
                contentType,
                genre,
                platform,
                summary,
                mainActors,
                director,
                duration,
                videoLink,
                languageSpecificRecommendations,
                searchTermImage
            ]
        );

        console.log("Film başarıyla kaydedildi/güncellendi:", result.rowCount);
        res.redirect('/profil');
    } catch (err) {
        console.error('Database error:', err);
        res.render("anasayfa.ejs", { message: 'Bir hata oluştu, lütfen tekrar deneyin.' });
    }
});



app.post('/comment', async (req, res) => {
    const user = req.session.user;
    if (!user) return res.redirect('/');

    const { yorum, searchTerm, userId, userName, userSurname, userImage } = req.body;
    const name = `${userName} ${userSurname}`;

    try {
        await db.query(
            'INSERT INTO comment (comment, filmname, user_id, username, user_image) VALUES ($1, $2, $3, $4, $5)',
            [yorum, searchTerm, userId, name, userImage]
        );

        req.session.message = {
            type: 'success',
            content: 'Yorum başarıyla eklendi!'
        };
        res.redirect('/home');
    } catch (err) {
        console.error('Database error:', err);
        req.session.message = {
            type: 'danger',
            content: 'Bir hata oluştu, lütfen tekrar deneyin.'
        };
        res.redirect('/home');
    }
});





app.post('/updateprofil',uploadProfile.single('profilimg') ,async (req,res)=>{
    try{
        const user = req.session.user;
            if (!user) {
                return res.redirect('/');
            }

        const profil = await db.query('SELECT * FROM profil WHERE id = $1', [user.id]);    
        const existingData = profil.rows[0];
        console.log("Mevcut Profil Verisi:", existingData);

        if (!existingData) {
            return res.status(404).send("Profil bulunamadı.");
        }

        const { name, surname, username, password, age, country, tel } = req.body;
        console.log("Gelen Veriler:", req.body);  

        const updatedUsername = username || existingData.username;
        const updatedName = name || existingData.name;
        const updatedPassword = password || existingData.password;
        const updatedSurname = surname || existingData.surname;
        const updatedAge = age || existingData.age;
        const updatedCountry = country || existingData.country;
        const updatedTel = tel || existingData.tel;

        const currentImagePath = existingData.profilimg;
        const imagePath = req.file ? req.file.filename : currentImagePath || 'defaultprofil.jpeg';

        const result = await db.query(
            'UPDATE profil SET username = $1 , password = $2, name = $3, surname = $4, age = $5, country = $6, tel = $7, profilimg = $8 WHERE id = $9',
            [updatedUsername, updatedPassword, updatedName, updatedSurname, updatedAge, updatedCountry, updatedTel, imagePath, user.id]
        );
        
        if (result.rowCount > 0) {
            req.session.user = {
                id: user.id,
                name: updatedName,
                usersurname: updatedSurname,
                userage: updatedAge,
                usertel: updatedTel,
                usercountry: updatedCountry,
                profilimg: imagePath
            };
            
        req.session.message = {
            type: 'success',
            content: 'Profil başarıyla güncellendi!'
        };
            return res.redirect('/profil');
        } else {
              req.session.message = {
            type: 'danger',
            content: 'Profil güncellenemedi!'
        };
            return res.render('profil.ejs', { message: 'Profil güncellenemedi.' });
        }
        

        }
    catch(err){
        console.error('Database error:', err);
        res.render("profil.ejs", { message: 'An unexpected error occurred' });}

})


app.get('/profil',  async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }
    try{
        const savedFilms = await db.query('SELECT * FROM savedfilm WHERE user_id = $1', [user.id]);
        const savedFilmsData = savedFilms.rows;

        if (savedFilmsData.length === 0) {
            console.log('No saved films found for this user.');
            
        }
        const comment = await db.query('SELECT * FROM comment WHERE user_id = $1', [user.id]);
        const commentData = comment.rows;
        if (commentData.length === 0) {
            console.log('No comments found for this user.');
        }
        
        const filmName = commentData.map(comment => comment.filmname);
        const film_image = await getFilmImage(filmName);
        console.log("Film Görseli URL:", film_image);

        const message = req.session.message;
        req.session.message = null;



        console.log('User comments:', commentData);

        
        console.log('Saved films:', savedFilmsData);
        const profil   = await db.query('SELECT * FROM profil WHERE id = $1', [user.id]);
        const profilimg = profil.rows[0].profilimg;
        const username = profil.rows[0].username;
        const name = profil.rows[0].name;
        const surname = profil.rows[0].surname;
        const age = profil.rows[0].age;
        const tel = profil.rows[0].tel;
        const country = profil.rows[0].country;
        console.log('Profil bilgileri:', profil.rows[0]);

        res.render('profil.ejs', { user,savedFilms : savedFilmsData ,comment: commentData , film_image,message ,profilimg , username , name , surname , age , tel , country , formatDate});
    }
    catch(err){
        console.error('Database error:', err);
        res.render("profil.ejs", { message: 'An unexpected error occurred' });
    }
});

app.post('/deletefilm', async (req, res) => {
const user = req.session.user;
if (!user){
    return res.redirect('/');
}

const filmId = req.body.filmId; 
console.log("Silinecek film ID:", filmId);

try{
    const result = await db.query('DELETE FROM savedfilm WHERE id = $1 AND user_id = $2', [filmId, user.id]);
    if (result.rowCount > 0) {
        req.session.message = { type: 'success', content: 'İçerik başarıyla silindi' }; 
        console.log('Film başarıyla silindi:', filmId);
        res.redirect('/profil'); 
    } else {
        req.session.message = 'İçerik silinemedi.';
        res.render("profile.ejs", { message: 'An unexpected error occurred' });
    }   
}
catch(err){
    console.error('Database error:', err);
    res.render("profil.ejs", { message: 'An unexpected error occurred' });
}

})

app.post('/updatecomment', async (req, res) => {
    const user = req.session.user;
    if (!user){
        return res.redirect('/');
    }
const { commentId, comment } = req.body;
console.log("Güncellenecek yorum ID:", commentId);
console.log("Yeni yorum:", comment);
try {
    const result = await db.query('UPDATE comment SET comment = $1 WHERE id = $2 AND user_id = $3', [comment, commentId , user.id]);
    if (result.rowCount > 0) {
        req.session.message = { type: 'success', content: 'Yorum başarıyla güncellendi' };
        console.log('Yorum başarıyla güncellendi:', commentId);
        res.redirect('/profil');
    } else {
        res.render("profil.ejs", { message: 'An unexpected error occurred' });
    }

}
catch (err) {
    console.error('Database error:', err);
    res.render("profil.ejs", { message: 'An unexpected error occurred' });
}


});

app.post('/deletecomment', async (req, res) => {
    const user = req.session.user;
    if (!user) {
        return res.redirect('/');
    }
    const commentId = req.body.commentId;

    console.log("Silinecek yorum ID:", commentId);

    try {
        const result = await db.query('DELETE FROM comment WHERE id = $1 AND user_id = $2', [commentId, user.id]);
        if (result.rowCount > 0) {
            req.session.message = { type: 'success', content: 'Yorum başarıyla silindi' };
            console.log('Yorum başarıyla silindi:', commentId);
        } else {
            req.session.message = { type: 'danger', content: 'Yorum silinemedi.' }; 
        }
        res.redirect('/profil'); 
    } catch (err) {
        console.error('Database error:', err);
        req.session.message = { type: 'danger', content: 'Bir hata oluştu.' };
        res.redirect('/profil');
    }
});





app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/'); 
    });
})
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        res.redirect('/'); 
    });
});



app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

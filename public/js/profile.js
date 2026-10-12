import { supabase, currentUser, requireAuth } from './supabaseClient.js';
requireAuth();

document.getElementById('prof-username').value = currentUser.username;

document.getElementById('btn-save').addEventListener('click', async () => {
    const uname = document.getElementById('prof-username').value.trim();
    const pin = document.getElementById('prof-pin').value.trim();
    
    if(!uname) return alert('Username cannot be empty');
    
    const updates = { username: uname };
    if(pin) {
        if(pin.length !== 4 || isNaN(pin)) return alert('PIN must be exactly 4 digits.');
        updates.pin = pin;
    }
    
    const btn = document.getElementById('btn-save');
    btn.disabled = true; btn.textContent = 'Saving...';
    
    try {
        const { error } = await supabase.from('users').update(updates).eq('id', currentUser.id);
        if(error) throw error;
        alert('Profile updated successfully! You will need to log in again if you changed your PIN.');
        if(pin) {
            localStorage.removeItem('litaj_session');
            window.location.href = '/login.html';
        } else {
            // update session cache
            const sess = JSON.parse(localStorage.getItem('litaj_session') || '{}');
            sess.username = uname;
            localStorage.setItem('litaj_session', JSON.stringify(sess));
            window.location.reload();
        }
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Update Profile';
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('litaj_session');
    window.location.href = '/login.html';
});

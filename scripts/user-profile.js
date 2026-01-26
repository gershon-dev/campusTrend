// User profile data
let profileData = {
    id: null,
    full_name: "Loading...",
    email: "",
    department: "",
    bio: "Tell us about yourself",
    location: "Winneba, Central Region",
    avatar_url: null,
    created_at: new Date()
};

// Initialize profile on page load
async function initializeProfile() {
    try {
        // Check authentication
        const isLoggedIn = await window.isLoggedIn();
        if (!isLoggedIn) {
            window.location.href = 'sign-in.html';
            return;
        }

        // Get current user and profile
        const user = await window.getCurrentUser();
        const profile = await window.getCurrentProfile();

        if (user && profile) {
            profileData = {
                id: user.id,
                email: user.email,
                full_name: profile.full_name || 'Student',
                department: profile.department || 'UEW Student',
                bio: profile.bio || 'Tell us about yourself',
                location: profile.location || 'Winneba, Central Region',
                avatar_url: profile.avatar_url,
                index_number: profile.index_number,
                created_at: profile.created_at
            };

            // Load profile UI
            loadProfile();
            loadUserPosts();
        }
    } catch (error) {
        console.error('Profile initialization error:', error);
        showToast('Error loading profile', 'error');
    }
}

// Load profile data into UI
function loadProfile() {
    const initials = getInitials(profileData.full_name);
    const joinDate = new Date(profileData.created_at);
    const joinMonth = joinDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

    // Update avatar
    document.getElementById('profileAvatar').textContent = initials;

    // Update profile info
    document.getElementById('profileName').textContent = profileData.full_name;
    document.getElementById('profileUsername').textContent = `@${profileData.index_number || 'student'}`;
    document.getElementById('profileDepartment').textContent = profileData.department;

    // Update about section
    document.getElementById('aboutDepartment').textContent = profileData.department;
    document.getElementById('aboutLocation').textContent = profileData.location;
    document.getElementById('aboutBio').textContent = profileData.bio;
    document.getElementById('aboutJoined').textContent = joinMonth;

    // Set form values for editing
    document.getElementById('editName').value = profileData.full_name;
    document.getElementById('editBio').value = profileData.bio;
    document.getElementById('editLocation').value = profileData.location;

    console.log('Profile loaded:', profileData);
}

// Load user's posts
async function loadUserPosts() {
    try {
        const result = await window.getPosts('all', 50);
        
        if (result.success && result.posts) {
            // Filter posts for current user
            const userPosts = result.posts.filter(post => post.user_id === profileData.id);
            
            document.getElementById('postsCount').textContent = userPosts.length;
            
            if (userPosts.length === 0) {
                document.getElementById('noPosts').style.display = 'block';
                document.getElementById('postsGrid').innerHTML = '';
            } else {
                document.getElementById('noPosts').style.display = 'none';
                renderPostsGrid(userPosts);
            }
        }
    } catch (error) {
        console.error('Error loading posts:', error);
    }
}

// Render posts in grid
function renderPostsGrid(posts) {
    const grid = document.getElementById('postsGrid');
    
    grid.innerHTML = posts.map(post => `
        <div class="post-card-mini">
            <div class="post-image-mini">
                ${post.image_url ? 
                    `<img src="${post.image_url}" alt="Post">` : 
                    `<div class="post-placeholder"><i class="fas fa-image"></i></div>`
                }
            </div>
            <div class="post-overlay">
                <div class="post-stats-mini">
                    <span><i class="fas fa-heart"></i> ${post.likes_count || 0}</span>
                    <span><i class="fas fa-comment"></i> ${(post.comments || []).length || 0}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Get initials
function getInitials(name) {
    if (!name) return "U";
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Open edit modal
function openEditModal(type) {
    const modal = document.getElementById('editModal');
    const title = document.getElementById('modalTitle');
    
    switch(type) {
        case 'profile':
            title.textContent = 'Edit Profile';
            break;
        case 'about':
            title.textContent = 'Edit About';
            break;
        case 'avatar':
            title.textContent = 'Change Profile Picture';
            break;
    }
    
    modal.classList.add('show');
}

// Close edit modal
function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

// Save profile changes
async function saveProfile() {
    try {
        const updates = {
            full_name: document.getElementById('editName').value,
            bio: document.getElementById('editBio').value,
            location: document.getElementById('editLocation').value
        };

        // Validate
        if (!updates.full_name.trim()) {
            showToast('Name cannot be empty', 'error');
            return;
        }

        // Update profile in Supabase
        const result = await window.updateProfile(updates);
        
        if (result.success) {
            profileData.full_name = updates.full_name;
            profileData.bio = updates.bio;
            profileData.location = updates.location;
            
            loadProfile();
            closeEditModal();
            showToast('Profile updated successfully!', 'success');
        } else {
            showToast('Error updating profile', 'error');
        }
    } catch (error) {
        console.error('Save profile error:', error);
        showToast('Error saving profile', 'error');
    }
}

// Navigation functions
function goToHome() {
    window.location.href = 'index.html';
}

// Logout
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            const result = await window.signOut();
            if (result.success) {
                localStorage.removeItem('campusTrendSession');
                sessionStorage.removeItem('campusTrendSession');
                window.location.href = 'sign-in.html';
            }
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = 'sign-in.html';
        }
    }
}

// Toast notification
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const icon = toast.querySelector('i');
    
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    icon.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
    
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('editModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeEditModal();
            }
        });
    }

    // Initialize profile
    initializeProfile();
});
from django.contrib.auth import get_user_model
from rest_framework import serializers


User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "name", "phone", "role", "is_active", "is_staff", "is_superuser", "created_at", "updated_at", "last_login")
        read_only_fields = ("id", "is_staff", "is_superuser", "created_at", "updated_at", "last_login")


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("id", "email", "name", "phone", "role", "is_active", "password")

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class UserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("email", "name", "phone", "role", "is_active")


class PasswordResetSerializer(serializers.Serializer):
    temporary_password = serializers.CharField(read_only=True)

